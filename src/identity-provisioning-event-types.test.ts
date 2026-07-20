import { describe, expect, test } from 'bun:test';
import {
  assertIdentityProvisioningEnvelope,
  parseIdentityProvisioningEvent,
  type IdentityGroupMembershipChangedEvent,
  type IdentityUserProvisioningEvent,
} from './identity-provisioning-event-types';

const userProvisioned = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'identity.user.provisioned',
  tenant_id: 'tenant-1',
  resource_id: 'user-42',
  user_name: 'jane.doe',
  external_id: 'okta-jane-42',
  observedBy: 'identity-service',
  ...over,
});

const groupMembershipChanged = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: 'identity.group.membership.changed',
  tenant_id: 'tenant-1',
  resource_id: 'group-7',
  display_name: 'Engineering',
  added_members: ['user-42'],
  removed_members: [],
  mapped_role: 'engineer',
  ...over,
});

describe('assertIdentityProvisioningEnvelope', () => {
  test('accepts a valid base envelope', () => {
    expect(() => assertIdentityProvisioningEnvelope(userProvisioned())).not.toThrow();
  });

  test('rejects an unknown type', () => {
    expect(() =>
      assertIdentityProvisioningEnvelope(userProvisioned({ type: 'identity.user.deleted' })),
    ).toThrow(/unknown 'type'/);
  });

  test('rejects an empty tenant_id', () => {
    expect(() => assertIdentityProvisioningEnvelope(userProvisioned({ tenant_id: '' }))).toThrow(
      /tenant_id/,
    );
  });

  test('rejects a non-object', () => {
    expect(() => assertIdentityProvisioningEnvelope(null)).toThrow();
  });
});

describe('parseIdentityProvisioningEvent', () => {
  test('parses identity.user.provisioned', () => {
    const e = parseIdentityProvisioningEvent(userProvisioned()) as IdentityUserProvisioningEvent;
    expect(e.user_name).toBe('jane.doe');
    expect(e.external_id).toBe('okta-jane-42');
  });

  test('parses identity.group.membership.changed', () => {
    const e = parseIdentityProvisioningEvent(
      groupMembershipChanged(),
    ) as IdentityGroupMembershipChangedEvent;
    expect(e.added_members).toEqual(['user-42']);
    expect(e.mapped_role).toBe('engineer');
  });

  // RED WITHOUT FIX: a malformed identity.user.provisioned missing user_name
  // must fail closed rather than let a consumer read undefined off the wire.
  test('rejects a malformed identity.user.provisioned (missing user_name)', () => {
    const { user_name: _omit, ...malformed } = userProvisioned();
    expect(() => parseIdentityProvisioningEvent(malformed)).toThrow(/user_name/);
  });

  test('rejects identity.group.membership.changed missing member deltas', () => {
    const { added_members: _omit, ...malformed } = groupMembershipChanged();
    expect(() => parseIdentityProvisioningEvent(malformed)).toThrow(/added_members/);
  });
});
