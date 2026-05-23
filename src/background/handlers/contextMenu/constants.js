/**
 * Context menu IDs and analysis mode configuration.
 */

// ========== CONSTANTS ==========

/**
 * Menu item IDs.
 * Parent menu is the root; children are analysis modes + options.
 */
export const MENU_IDS = {
  PARENT: 'chatgpt-assistant',
  // Analysis modes
  SUMMARIZE: 'chatgpt-assistant-summarize',
  ANALYZE: 'chatgpt-assistant-analyze',
  KEY_POINTS: 'chatgpt-assistant-keypoints',
  TRANSLATE: 'chatgpt-assistant-translate',
  REWRITE: 'chatgpt-assistant-rewrite',
  CUSTOM: 'chatgpt-assistant-custom',
  // Writing Assistant (XST-780)
  IMPROVE: 'chatgpt-assistant-improve',
  EXPLAIN: 'chatgpt-assistant-explain',
  // Separator
  SEP_OPTIONS: 'chatgpt-assistant-sep-options',
  // Options (checkbox toggles)
  SIDE_PANEL: 'chatgpt-assistant-sidepanel',
  CONTINUE_CHAT: 'chatgpt-assistant-continue'
};

/**
 * Analysis mode configurations.
 * Each mode has a label (Vietnamese), a prompt template with {CONTENT}/{CONTEXT_INFO}
 * placeholders, and optionally a Supabase prompt key override.
 */
export const ANALYSIS_MODES = {
  [MENU_IDS.SUMMARIZE]: {
    label: 'T\u00f3m t\u1eaft nhanh',
    promptTemplate: 'H\u00e3y t\u00f3m t\u1eaft ng\u1eafn g\u1ecdn n\u1ed9i dung sau trong 3-5 c\u00e2u ch\u00ednh:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83d\udcdd'
  },
  [MENU_IDS.ANALYZE]: {
    label: 'Ph\u00e2n t\u00edch chi ti\u1ebft',
    promptTemplate: null, // Uses Supabase prompt.contextMenu or default
    supabaseKey: 'prompt.contextMenu',
    icon: '\ud83d\udd0d'
  },
  [MENU_IDS.KEY_POINTS]: {
    label: 'Tr\u00edch xu\u1ea5t \u00fd ch\u00ednh',
    promptTemplate: 'H\u00e3y tr\u00edch xu\u1ea5t c\u00e1c \u00fd ch\u00ednh t\u1eeb n\u1ed9i dung sau d\u01b0\u1edbi d\u1ea1ng danh s\u00e1ch g\u1ea1ch \u0111\u1ea7u d\u00f2ng. M\u1ed7i \u00fd ch\u00ednh g\u1ed3m ti\u00eau \u0111\u1ec1 ng\u1eafn v\u00e0 gi\u1ea3i th\u00edch 1-2 c\u00e2u:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83d\udccb'
  },
  [MENU_IDS.TRANSLATE]: {
    label: 'D\u1ecbch sang Vi\u1ec7t/English',
    promptTemplate: 'D\u1ecbch n\u1ed9i dung sau. N\u1ebfu n\u1ed9i dung l\u00e0 ti\u1ebfng Vi\u1ec7t, d\u1ecbch sang ti\u1ebfng Anh. N\u1ebfu l\u00e0 ti\u1ebfng Anh ho\u1eb7c ng\u00f4n ng\u1eef kh\u00e1c, d\u1ecbch sang ti\u1ebfng Vi\u1ec7t. Gi\u1eef nguy\u00ean \u0111\u1ecbnh d\u1ea1ng v\u00e0 \u00fd ngh\u0129a g\u1ed1c.\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83c\udf10'
  },
  [MENU_IDS.REWRITE]: {
    label: 'Vi\u1ebft l\u1ea1i ng\u1eafn g\u1ecdn',
    promptTemplate: 'H\u00e3y vi\u1ebft l\u1ea1i n\u1ed9i dung sau m\u1ed9t c\u00e1ch ng\u1eafn g\u1ecdn, r\u00f5 r\u00e0ng v\u00e0 d\u1ec5 hi\u1ec3u h\u01a1n. Gi\u1eef nguy\u00ean c\u00e1c th\u00f4ng tin quan tr\u1ecdng v\u00e0 c\u1ea5u tr\u00fac logic:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\u270f\ufe0f'
  },
  [MENU_IDS.CUSTOM]: {
    label: 'Ph\u00e2n t\u00edch (t\u00f9y ch\u1ec9nh)',
    promptTemplate: null, // Uses Supabase prompt.contextMenu
    supabaseKey: 'prompt.contextMenu',
    icon: '\u2699\ufe0f'
  }
};
