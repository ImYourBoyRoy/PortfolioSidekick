// ./sidekick/src/i18n/messages/index.js
/**
 * Per-locale message catalogs keyed by BCP 47 tags (see locales.js).
 */
import { enUS } from './en-US.js';
import es from './es.js';
import zhCN from './zh-CN.js';
import tl from './tl.js';
import viVN from './vi-VN.js';
import ar from './ar.js';
import fr from './fr.js';
import ko from './ko.js';
import ru from './ru.js';
import ptBR from './pt-BR.js';
import de from './de.js';
import hi from './hi.js';

/** @type {Record<string, Record<string, string>>} */
export const MESSAGE_CATALOG = {
  'en-US': enUS,
  es,
  'zh-CN': zhCN,
  tl,
  'vi-VN': viVN,
  ar,
  fr,
  ko,
  ru,
  'pt-BR': ptBR,
  de,
  hi,
};
