import crypto from 'crypto';

/**
 * Lista consistente de domínios de e-mail temporário/descartável conhecidos.
 * Bloqueada no cadastro por e-mail/senha e na reivindicação do Passe Gratuito.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  '10mail.org',
  '10minemail.com',
  '10minutemail.co.uk',
  '10minutemail.com',
  '10minutemail.de',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'anonymbox.com',
  'armyspy.com',
  'binkmail.com',
  'bobmail.info',
  'burnermail.io',
  'byom.de',
  'chammy.info',
  'crazymailing.com',
  'cuvox.de',
  'dayrep.com',
  'devnullmail.com',
  'discard.email',
  'discardmail.com',
  'discardmail.de',
  'disposable.email',
  'disposableemailaddresses.com',
  'disposableinbox.com',
  'disposablemail.com',
  'dispostable.com',
  'dodgit.com',
  'dropmail.me',
  'e4ward.com',
  'einrot.com',
  'email-fake.com',
  'email60.com',
  'emailfake.com',
  'emailmiser.com',
  'emailondeck.com',
  'emailtemporanea.com',
  'emailtemporaria.com.br',
  'emailtemporario.com.br',
  'fakeinbox.com',
  'fakemail.net',
  'filzmail.com',
  'fleckens.hu',
  'generator.email',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'gustr.com',
  'haltospam.com',
  'harakirimail.com',
  'inboxbear.com',
  'inboxkitten.com',
  'incognitomail.com',
  'incognitomail.org',
  'instant-mail.de',
  'instantlyemail.com',
  'jetable.org',
  'jourrapide.com',
  'klzlk.com',
  'koszmail.pl',
  'kurzepost.de',
  'lroid.com',
  'mail.tm',
  'mail7.io',
  'mailcatch.com',
  'maildrop.cc',
  'maildx.com',
  'mailexpire.com',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'mailnator.com',
  'mailnesia.com',
  'mailnull.com',
  'mailpoof.com',
  'mailsac.com',
  'mailtemp.net',
  'mailtothis.com',
  'meltmail.com',
  'mintemail.com',
  'moakt.cc',
  'moakt.com',
  'moakt.ws',
  'mohmal.com',
  'msgos.com',
  'mt2014.com',
  'mt2015.com',
  'mytemp.email',
  'mytempmail.com',
  'mytrashmail.com',
  'nada.email',
  'nada.ltd',
  'nobulk.com',
  'noclickemail.com',
  'nogmailspam.info',
  'nomail.xl.cx',
  'nowmymail.com',
  'nwytg.net',
  'objectmail.com',
  'oneoffmail.com',
  'pokemail.net',
  'pookmail.com',
  'proxymail.eu',
  'quickinbox.com',
  'rcpt.at',
  'rhyta.com',
  'safe-mail.net',
  'sharklasers.com',
  'shortmail.net',
  'sneakemail.com',
  'soodonims.com',
  'spam4.me',
  'spambob.com',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spambox.us',
  'spamcero.com',
  'spamdecoy.net',
  'spamex.com',
  'spamfree24.org',
  'spamgourmet.com',
  'spamherelots.com',
  'spamspot.com',
  'supergreatmail.com',
  'superrito.com',
  'teleworm.us',
  'temp-mail.de',
  'temp-mail.io',
  'temp-mail.org',
  'temp-mail.ru',
  'tempail.com',
  'tempemail.co.za',
  'tempemail.com',
  'tempemail.net',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.de',
  'tempmail.net',
  'tempmail.org',
  'tempmail.plus',
  'tempmailaddress.com',
  'tempmailo.com',
  'temporary-mail.net',
  'tempr.email',
  'throwawayemailaddress.com',
  'throwawaymail.com',
  'tmail.ws',
  'tmailor.com',
  'tmpmail.net',
  'tmpmail.org',
  'trash-mail.com',
  'trashmail.at',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

export function isDisposableEmail(email: string): boolean {
  const clean = (email || '').trim().toLowerCase();
  const atIdx = clean.lastIndexOf('@');
  if (atIdx < 0) return false;
  const domain = clean.slice(atIdx + 1).trim();
  if (!domain) return false;

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;

  for (const blocked of Array.from(DISPOSABLE_EMAIL_DOMAINS)) {
    if (domain.endsWith(`.${blocked}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Normaliza o e-mail para detectar múltiplos cadastros com alias (+tag)
 * ou variação de pontos no Gmail/Googlemail.
 */
export function normalizeEmailForAntiAbuse(email: string): string {
  const clean = (email || '').trim().toLowerCase();
  const atIdx = clean.lastIndexOf('@');
  if (atIdx < 0) return clean;

  let local = clean.slice(0, atIdx);
  let domain = clean.slice(atIdx + 1);

  const plusIdx = local.indexOf('+');
  if (plusIdx >= 0) {
    local = local.slice(0, plusIdx);
  }

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }

  return `${local}@${domain}`;
}

export function extractClientIp(headers: Headers): string {
  const cfIp = (headers.get('cf-connecting-ip') || '').trim();
  if (cfIp) return cfIp;

  const realIp = (headers.get('x-real-ip') || '').trim();
  if (realIp) return realIp;

  const xff = (headers.get('x-forwarded-for') || '').trim();
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}

export function computeIpHash(ip: string): string {
  const salt =
    (process.env.FREE_PASS_IP_SALT || '').trim() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    'rubsax-free-pass-salt';

  return crypto
    .createHash('sha256')
    .update(`${ip}|${salt}`)
    .digest('hex');
}
