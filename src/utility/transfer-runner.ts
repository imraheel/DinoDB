import { open, rename, rm, stat } from 'node:fs/promises';
import { BSON, MongoBulkWriteError, type Document, type MongoClient } from 'mongodb';
import type { TransferJob, TransferProgress } from '../shared/transfer';
import { assertReadOnlyPipeline, transferTempPaths } from '../shared/transfer';
import { csvCell, documentOf, jsonText, readDocuments } from './transfer-codecs';

export async function runTransfer(
  job: TransferJob,
  client: MongoClient,
  signal: AbortSignal,
  notify: (progress: TransferProgress) => void
): Promise<void> {
  const started = Date.now();
  let lastSent = 0;
  const progress: TransferProgress = {
    tabId: job.tabId,
    status: 'running',
    phase: 'Connecting',
    documents: 0,
    bytes: 0,
    elapsedMs: 0,
    filePath: job.filePath,
    format: job.format
  };
  function emit(force = false) {
    if (!force && Date.now() - lastSent < 250) return;
    lastSent = Date.now();
    notify({ ...progress, elapsedMs: Date.now() - started });
  }
  function phase(text: string) {
    progress.phase = text;
    emit(true);
  }
  const heartbeat = setInterval(() => emit(), 250);
  const [partial, spool] = transferTempPaths(job);
  try {
    emit(true);
    await client.connect();
    signal.throwIfAborted();
    const collection = client.db(job.database).collection(job.collection);
    if (job.direction === 'import') {
      progress.totalBytes = (await stat(job.filePath)).size;
      phase('Reading and inserting');
      let batch: Document[] = [];
      let batchBytes = 0;
      async function flush() {
        if (batch.length === 0) return;
        signal.throwIfAborted();
        progress.uncertainBatch = true;
        emit(true);
        try {
          const result = await collection.insertMany(batch, { ordered: true, timeoutMS: 30000 });
          progress.documents += result.insertedCount;
          progress.uncertainBatch = false;
        } catch (error) {
          if (error instanceof MongoBulkWriteError) {
            progress.documents += error.result.insertedCount;
            // Network/write concern failures may have an unknown acknowledgement outcome.
            const hasWriteErrors = Array.isArray(error.writeErrors)
              ? error.writeErrors.length > 0
              : Boolean(error.writeErrors);
            progress.uncertainBatch =
              error.result.getWriteConcernError() !== undefined || !hasWriteErrors;
          }
          throw error;
        }
        batch = [];
        batchBytes = 0;
        emit();
        signal.throwIfAborted();
      }
      for await (const document of readDocuments(
        job.filePath,
        job.format,
        (bytes) => {
          progress.bytes = bytes;
          emit();
        },
        signal
      )) {
        signal.throwIfAborted();
        batch.push(document);
        batchBytes += BSON.calculateObjectSize(document);
        if (batch.length >= 500 || batchBytes >= 8 * 1024 * 1024) await flush();
      }
      await flush();
    } else {
      const source = job.source ?? { kind: 'collection' };
      let cursor:
        | ReturnType<typeof collection.find>
        | ReturnType<typeof collection.aggregate>
        | undefined;
      let documents: AsyncIterable<Document>;
      if (source.kind === 'selected') {
        progress.totalDocuments = source.documents.length;
        documents = (async function* () {
          for (const document of source.documents) {
            signal.throwIfAborted();
            yield documentOf(BSON.EJSON.deserialize(document as Document, { relaxed: false }));
          }
        })();
      } else {
        // AggregateOptions omits timeoutMode from its published types, but its
        // underlying cursor supports the same per-iteration option as find.
        const cursorOptions = {
          promoteValues: false,
          promoteLongs: false,
          timeoutMS: 30000,
          timeoutMode: 'iteration' as const
        };
        if (source.kind === 'aggregate') {
          assertReadOnlyPipeline(source.pipeline);
          cursor = collection.aggregate(
            BSON.EJSON.deserialize(source.pipeline, { relaxed: false }) as Document[],
            cursorOptions
          );
        } else {
          cursor = collection.find(
            source.kind === 'find'
              ? (BSON.EJSON.deserialize(source.filter as Document, { relaxed: false }) as Document)
              : {},
            {
              ...cursorOptions,
              ...(source.kind === 'find'
                ? {
                    projection:
                      source.projection === undefined
                        ? undefined
                        : (BSON.EJSON.deserialize(source.projection as Document) as Document),
                    sort:
                      source.sort === undefined
                        ? undefined
                        : (BSON.EJSON.deserialize(source.sort as Document) as Document),
                    skip: source.skip,
                    limit: source.limit
                  }
                : {})
            }
          );
        }
        cursor.batchSize(500);
        documents = cursor as AsyncIterable<Document>;
      }
      try {
        if (job.format === 'csv') {
          phase('Discovering CSV columns');
          const columns = new Set<string>();
          const staging = await open(spool, 'wx');
          let discovered = 0;
          try {
            for await (const document of documents) {
              signal.throwIfAborted();
              for (const key of Object.keys(document)) columns.add(key);
              if (columns.size > 100000)
                throw new Error('CSV export exceeds 100,000 distinct columns.');
              await staging.writeFile(`${jsonText(document)}\n`);
              discovered++;
              progress.documents = discovered;
              emit();
            }
          } finally {
            await staging.close();
          }
          progress.totalDocuments = discovered;
          progress.documents = 0;
          phase('Writing CSV');
          const output = await open(partial, 'wx');
          try {
            const headers = columns.size > 0 ? [...columns] : ['_id'];
            const header = headers.map(csvCell).join(',') + '\r\n';
            await output.writeFile(header);
            progress.bytes += Buffer.byteLength(header);
            if (discovered > 0) {
              for await (const document of readDocuments(spool, 'json', () => {}, signal)) {
                signal.throwIfAborted();
                const row = headers.map((key) => csvCell(document[key])).join(',') + '\r\n';
                await output.writeFile(row);
                progress.bytes += Buffer.byteLength(row);
                progress.documents++;
                emit();
              }
            }
          } finally {
            await output.close();
          }
        } else {
          phase(job.format === 'bson' ? 'Writing BSON' : 'Writing JSON');
          const output = await open(partial, 'wx');
          try {
            if (job.format === 'json') {
              await output.writeFile('[\n');
              progress.bytes += 2;
            }
            for await (const document of documents) {
              signal.throwIfAborted();
              const encoded =
                job.format === 'bson'
                  ? BSON.serialize(document)
                  : `${progress.documents === 0 ? '' : ',\n'}${jsonText(document)}`;
              await output.writeFile(encoded);
              progress.bytes +=
                typeof encoded === 'string' ? Buffer.byteLength(encoded) : encoded.length;
              progress.documents++;
              emit();
            }
            if (job.format === 'json') {
              await output.writeFile('\n]\n');
              progress.bytes += 3;
            }
          } finally {
            await output.close();
          }
        }
        signal.throwIfAborted();
        phase('Finishing export');
        await cursor?.close();
        cursor = undefined;
        signal.throwIfAborted();
        await rename(partial, job.filePath);
      } finally {
        await cursor?.close();
      }
    }
    progress.status = 'completed';
    progress.phase = 'Completed';
  } catch (error) {
    progress.status = signal.aborted ? 'cancelled' : 'failed';
    progress.phase = signal.aborted ? 'Cancelled' : 'Failed';
    progress.error = error instanceof Error ? error.message : String(error);
  } finally {
    // Cleanup is also attempted by the manager after forced shutdown.
    if (job.direction === 'export') {
      await Promise.all([partial, spool].map((path) => rm(path, { force: true }).catch(() => {})));
    }
    await client.close().catch(() => {});
    clearInterval(heartbeat);
    emit(true);
  }
}
