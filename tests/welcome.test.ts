import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WELCOME_MESSAGE,
  renderWelcomeMessage,
} from '../src/modules/welcome/welcomeMessage.js';

describe('renderWelcomeMessage', () => {
  const ctx = { mention: '<@42>', guildName: 'HotzDogz' };

  it('remplace {membre} et {serveur}', () => {
    const out = renderWelcomeMessage('Salut {membre}, bienvenue sur {serveur} !', ctx);
    expect(out).toBe('Salut <@42>, bienvenue sur HotzDogz !');
  });

  it('remplace toutes les occurrences', () => {
    expect(renderWelcomeMessage('{membre} {membre}', ctx)).toBe('<@42> <@42>');
  });

  it('utilise le message par defaut si le gabarit est vide ou null', () => {
    const fromNull = renderWelcomeMessage(null, ctx);
    const fromBlank = renderWelcomeMessage('   ', ctx);
    expect(fromNull).toBe(fromBlank);
    expect(fromNull).toContain('<@42>');
    expect(DEFAULT_WELCOME_MESSAGE).toContain('{membre}');
  });
});
