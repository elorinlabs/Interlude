import { displayText } from './index';


export function profileRole(profile?: { role: string; roleName?: string | null } | null) {
  const name = profile?.roleName;
  if (name && name !== '管理员' && name !== '用户') return name;
  return displayText(name || (profile?.role === 'admin' ? "client.app.administrator" : "client.app.user"));
}
