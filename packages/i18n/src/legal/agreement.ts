import { userAgreementEn } from './en';
import { userAgreementZh } from './zh';
import { userAgreementRu } from './ru';
import userAgreementJa from './ja.json';
import type { AgreementLanguage } from './types';

export const AGREEMENT_VERSION = '2026-09-25';
export const getUserAgreement = (language: AgreementLanguage) => ({
  en: userAgreementEn, zh: userAgreementZh, ru: userAgreementRu, ja: userAgreementJa,
})[language];

export const agreementCopy = {
  ja: {
    prefix: '', link: '利用規約', suffix: 'を読み、同意します', checkbox: '利用規約を読み、同意します',
    title: '利用規約をご確認ください',
    login: 'ログインを続けると、利用規約を読み、同意したものとみなされます。',
    register: '登録を続けると、利用規約を読み、同意したものとみなされます。',
    confirmLogin: '同意してログイン', confirmRegister: '同意して登録', cancel: '今は同意しない', close: '利用規約を閉じる',
  },
  ru: {
    prefix: 'Я прочитал и принимаю', link: 'Пользовательское соглашение', suffix: '',
    checkbox: 'Я прочитал и принимаю Пользовательское соглашение',
    title: 'Ознакомьтесь с соглашением',
    login: 'Продолжая вход, вы подтверждаете, что прочитали и принимаете Пользовательское соглашение.',
    register: 'Продолжая регистрацию, вы подтверждаете, что прочитали и принимаете Пользовательское соглашение.',
    confirmLogin: 'Согласиться и войти', confirmRegister: 'Согласиться и зарегистрироваться',
    cancel: 'Не сейчас', close: 'Закрыть соглашение',
  },
  zh: {
    prefix: '我已阅读并同意', link: '《用户协议》', suffix: '', checkbox: '我已阅读并同意用户协议',
    title: '请阅读并同意用户协议', login: '继续登录即表示你已阅读并同意《用户协议》。',
    register: '继续注册即表示你已阅读并同意《用户协议》。',
    confirmLogin: '同意并登录', confirmRegister: '同意并注册', cancel: '暂不同意', close: '关闭协议',
  },
  en: {
    prefix: 'I have read and agree to the', link: 'User Agreement', suffix: '',
    checkbox: 'I have read and agree to the User Agreement',
    title: 'Review the User Agreement', login: 'By continuing to sign in, you confirm that you have read and agree '
      + 'to the User Agreement.', register: 'By continuing to register, you confirm that you have read and agree '
      + 'to the User Agreement.', confirmLogin: 'Agree and sign in', confirmRegister: 'Agree and register',
    cancel: 'Not now', close: 'Close agreement',
  },
} as const;
