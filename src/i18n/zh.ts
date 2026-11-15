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
} as const;

export type MessageKey = keyof typeof zh;
