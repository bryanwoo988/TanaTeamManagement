export const zh = {
  appName: 'Tana Team',
  greet: '你好，{name}',
  save: '保存',
  cancel: '取消',
  delete: '删除',
  confirm: '确认',
  loading: '加载中…',
  errorGeneric: '出错了，请稍后再试。',
  back: '返回',
  langZh: '华语',
  langEn: 'English',
  langMs: 'Melayu',
  appearanceTitle: '外观',
  appearanceModeSystem: '跟随手机',
  appearanceModeLight: '浅色',
  appearanceModeDark: '深色',
  appearanceHelp: '跟随手机时，手机是浅色就用你选的浅色主题，深色就用你选的深色主题。',
  appearanceLight: '浅色主题',
  appearanceDark: '深色主题',
} as const;

export type MessageKey = keyof typeof zh;
