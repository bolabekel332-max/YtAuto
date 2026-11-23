import test from 'node:test';
import assert from 'node:assert/strict';
import { complianceOut, SCHEMA_IDS, toJsonSchema } from './agentSchemas';

test('toJsonSchema menghasilkan JSON schema valid tanpa $schema atau additionalProperties untuk seluruh 9 schemaId', () => {
  for (const id of SCHEMA_IDS) {
    const schema = toJsonSchema(id);
    assert.equal(typeof schema, 'object');
    assert.ok(schema !== null);
    assert.equal('$schema' in schema, false);
    assert.equal('additionalProperties' in schema, false);
    assert.equal(schema.type, 'object');
  }
});

test('complianceOut superRefine menolak verdict reject tanpa issue severity high', () => {
  const invalidReject = complianceOut.safeParse({
    verdict: 'reject',
    issues: [
      {
        severity: 'medium',
        relatedAgent: 'scriptwriter',
        problem: 'Catatan ringan',
        fix: 'Perbaiki kalimat',
      },
    ],
    notes: 'Harus ditolak skema karena tidak ada issue high.',
  });
  assert.equal(invalidReject.success, false);

  const validReject = complianceOut.safeParse({
    verdict: 'reject',
    issues: [
      {
        severity: 'high',
        relatedAgent: 'scriptwriter',
        problem: 'Klaim medis berbahaya tanpa dasar',
        fix: 'Ubah menjadi penjelasan edukatif bersumber.',
      },
    ],
    notes: 'Valid.',
  });
  assert.equal(validReject.success, true);
});
