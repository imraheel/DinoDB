import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppState';
import { messageOf } from '../lib/errors';
import { validateConnection } from '../../../shared/validate';
import type { AuthMechanism, ConnectionConfig, ConnectionInput } from '../../../shared/types';
import Button from './ui/Button';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal';
import { BASE_INPUT_CLASS, LABEL_CLASS } from './ui/Input';

interface ConnectionModalProps {
  open: boolean;
  editing: ConnectionConfig | null;
  onClose(): void;
}

interface FormState {
  name: string;
  host: string;
  port: number;
  defaultDatabase: string;
  username: string;
  password: string;
  authMechanism: AuthMechanism;
  authSource: string;
  authMechanismProperties: string;
  extraOptions: string;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; version: string }
  | { status: 'fail'; error: string };

const BLANK_FORM: FormState = {
  name: '',
  host: 'localhost',
  port: 27017,
  defaultDatabase: '',
  username: '',
  password: '',
  authMechanism: '',
  authSource: '',
  authMechanismProperties: '',
  extraOptions: ''
};

const MECHANISM_OPTIONS: { value: AuthMechanism; label: string }[] = [
  { value: '', label: 'None / default (SCRAM)' },
  { value: 'DEFAULT', label: 'DEFAULT' },
  { value: 'MONGODB-X509', label: 'MONGODB-X509' },
  { value: 'MONGODB-AWS', label: 'MONGODB-AWS' },
  { value: 'GSSAPI', label: 'GSSAPI' },
  { value: 'PLAIN', label: 'PLAIN' }
];

const INPUT_CLASS = `${BASE_INPUT_CLASS} w-full`;

function toForm(connection: ConnectionConfig | null): FormState {
  if (connection === null) return BLANK_FORM;
  return {
    name: connection.name,
    host: connection.host,
    port: connection.port,
    defaultDatabase: connection.defaultDatabase,
    username: connection.username,
    password: connection.password,
    authMechanism: connection.authMechanism,
    authSource: connection.authSource,
    authMechanismProperties: connection.authMechanismProperties,
    extraOptions: connection.extraOptions
  };
}

export default function ConnectionModal({ open, editing, onClose }: ConnectionModalProps) {
  const { dispatch } = useApp();
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => {
    if (!open) return;
    setForm(toForm(editing));
    setErrors([]);
    setTest({ status: 'idle' });
  }, [open, editing]);

  function toInput(): ConnectionInput {
    return editing === null ? { ...form } : { ...form, id: editing.id };
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleTest() {
    setTest({ status: 'testing' });
    try {
      const result = await window.api.testConnection(toInput());
      if (result.ok) setTest({ status: 'ok', version: result.version ?? 'unknown' });
      else setTest({ status: 'fail', error: result.error ?? 'Connection failed' });
    } catch (err) {
      setTest({ status: 'fail', error: messageOf(err) });
    }
  }

  async function handleSave() {
    const input = toInput();
    const problems = validateConnection(input);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    try {
      const saved = await window.api.saveConnection(input);
      dispatch({ type: 'connections/upserted', connection: saved });
      onClose();
    } catch (err) {
      setErrors([messageOf(err)]);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void handleSave();
  }

  return (
    <Modal open={open} onClose={onClose} aria-label="Connection">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalHeader
          title={editing === null ? 'New connection' : 'Edit connection'}
          onClose={onClose}
        />
        <ModalBody className="space-y-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="connection-name">
              Name
            </label>
            <input
              id="connection-name"
              className={INPUT_CLASS}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <label className={LABEL_CLASS} htmlFor="connection-host">
                Host
              </label>
              <input
                id="connection-host"
                className={INPUT_CLASS}
                value={form.host}
                onChange={(event) => update('host', event.target.value)}
              />
            </div>
            <div className="w-28">
              <label className={LABEL_CLASS} htmlFor="connection-port">
                Port
              </label>
              <input
                id="connection-port"
                type="number"
                min={1}
                max={65535}
                className={INPUT_CLASS}
                value={form.port}
                onChange={(event) => update('port', Number(event.target.value))}
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="connection-database">
              Default database
            </label>
            <input
              id="connection-database"
              className={INPUT_CLASS}
              value={form.defaultDatabase}
              onChange={(event) => update('defaultDatabase', event.target.value)}
            />
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-label-tertiary">
              Authentication
            </h3>
            <div className="space-y-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="connection-mechanism">
                  Mechanism
                </label>
                <select
                  id="connection-mechanism"
                  className={INPUT_CLASS}
                  value={form.authMechanism}
                  onChange={(event) => update('authMechanism', event.target.value as AuthMechanism)}
                >
                  {MECHANISM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="connection-username">
                  Username
                </label>
                <input
                  id="connection-username"
                  className={INPUT_CLASS}
                  value={form.username}
                  onChange={(event) => update('username', event.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="connection-password">
                  Password
                </label>
                <input
                  id="connection-password"
                  type="password"
                  className={INPUT_CLASS}
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="connection-auth-source">
                  Auth source
                </label>
                <input
                  id="connection-auth-source"
                  className={INPUT_CLASS}
                  value={form.authSource}
                  onChange={(event) => update('authSource', event.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="connection-auth-properties">
                  Auth mechanism properties
                </label>
                <input
                  id="connection-auth-properties"
                  className={INPUT_CLASS}
                  placeholder='{"SERVICE_NAME":"mongodb"}'
                  value={form.authMechanismProperties}
                  onChange={(event) => update('authMechanismProperties', event.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="connection-extra-options">
              Extra URI options
            </label>
            <input
              id="connection-extra-options"
              className={INPUT_CLASS}
              placeholder='{"replicaSet":"rs0"}'
              value={form.extraOptions}
              onChange={(event) => update('extraOptions', event.target.value)}
            />
          </div>

          {errors.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-danger">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                size="md"
                onClick={() => void handleTest()}
                disabled={test.status === 'testing'}
              >
                Test connection
              </Button>
              {test.status === 'testing' ? (
                <span className="truncate text-xs text-label-tertiary">Testing connection…</span>
              ) : null}
              {test.status === 'ok' ? (
                <span className="truncate text-xs text-success">
                  Connected — MongoDB {test.version}
                </span>
              ) : null}
              {test.status === 'fail' ? (
                <span className="truncate text-xs text-danger">{test.error}</span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Save
              </Button>
            </div>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}
