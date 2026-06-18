import { describe, expect, it } from 'vitest';
import { extractQuantity } from '../src/modules/sales/quantity.js';

describe('extractQuantity', () => {
  it('lit le champ explicite du contenu, separateur espace', () => {
    expect(extractQuantity('peu importe', 'Quantite vendue : 2 000')).toBe(2000);
  });

  it('gere l’espace insecable comme separateur de milliers', () => {
    expect(extractQuantity('', 'Quantité vendue : 12 500')).toBe(12500);
  });

  it('extrait depuis le titre quand le contenu est vide', () => {
    expect(extractQuantity('VENTE - 1 500 hot dogs - 01/01/2026', '')).toBe(1500);
  });

  it('accepte un nombre colle dans le titre', () => {
    expect(extractQuantity('VENTE - 2000 hotdog - ...', '')).toBe(2000);
  });

  it('privilegie le contenu sur le titre', () => {
    expect(extractQuantity('VENTE - 999 hot dogs - x', 'Quantité vendue: 2 000')).toBe(2000);
  });

  it('ne devine pas une quantite a partir d’une date seule', () => {
    expect(extractQuantity('Bonjour 18/06/2026', 'Rien ici')).toBeNull();
  });

  it('retourne null si rien d’exploitable', () => {
    expect(extractQuantity('', '')).toBeNull();
    expect(extractQuantity('VENTE de hot dogs', 'aucune quantite')).toBeNull();
  });
});
