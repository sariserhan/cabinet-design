'use client';
import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import { Alert, AlertTitle } from '@/components/ui/alert';
export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <h1>Catalog Compiler</h1>
        <p className="text-muted-foreground">
          Turn manufacturer documents into source-linked catalogs.
        </p>
        <h2>
          {flow === 'signIn'
            ? 'Sign in to your workspace'
            : 'Create your workspace'}
        </h2>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setPending(true);
            const data = new FormData(e.currentTarget);
            data.set('flow', flow);
            try {
              await signIn('password', data);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Sign-in failed');
            } finally {
              setPending(false);
            }
          }}
        >
          <FieldGroup>
            {flow === 'signUp' ? (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" autoComplete="name" required />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete={
                  flow === 'signIn' ? 'current-password' : 'new-password'
                }
                required
              />
              <FieldDescription>
                Documents and review history are private to your account.
              </FieldDescription>
            </Field>
            <Button disabled={pending} type="submit">
              {pending
                ? 'Signing in…'
                : flow === 'signIn'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </FieldGroup>
        </form>
        <Button
          variant="ghost"
          onClick={() => {
            setFlow(flow === 'signIn' ? 'signUp' : 'signIn');
            setError('');
          }}
        >
          {flow === 'signIn'
            ? 'Create an account'
            : 'Already have an account? Sign in'}
        </Button>
      </section>
    </main>
  );
}
