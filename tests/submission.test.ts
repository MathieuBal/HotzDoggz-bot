import { describe, expect, it } from 'vitest';
import { evaluateSubmission, type SubmissionFacts } from '../src/modules/sales/submission.js';

const conforme: SubmissionFacts = {
  authorIsOwner: true,
  hasNewSaleTag: true,
  imageCount: 2,
  quantity: 2000,
  weekOpen: true,
};

describe('evaluateSubmission', () => {
  it('accepte une declaration conforme', () => {
    expect(evaluateSubmission(conforme).status).toBe('accepted');
  });

  it('refuse techniquement si l’auteur n’est pas le proprietaire', () => {
    const v = evaluateSubmission({ ...conforme, authorIsOwner: false });
    expect(v.status).toBe('technical_refusal');
  });

  it('marque incomplete et liste tous les manques corrigeables', () => {
    const v = evaluateSubmission({
      ...conforme,
      hasNewSaleTag: false,
      imageCount: 1,
      quantity: null,
    });
    expect(v.status).toBe('incomplete');
    expect(v.reasons).toHaveLength(3);
  });

  it('priorise le refus technique sur l’incompletude', () => {
    const v = evaluateSubmission({ ...conforme, authorIsOwner: false, imageCount: 0 });
    expect(v.status).toBe('technical_refusal');
  });

  it('bloque (sans penaliser) si aucune semaine n’est ouverte', () => {
    const v = evaluateSubmission({ ...conforme, weekOpen: false });
    expect(v.status).toBe('blocked');
  });

  it('signale l’incompletude avant l’absence de semaine', () => {
    const v = evaluateSubmission({ ...conforme, weekOpen: false, imageCount: 0 });
    expect(v.status).toBe('incomplete');
  });
});
