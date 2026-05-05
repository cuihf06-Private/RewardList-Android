import type { User, RewardList, Reward, Invitation, RewardCategory, RewardStatus } from './types';
import * as XLSX from 'xlsx';

export const APP_VERSION = '1.2.0';

const KEYS = {
  users: 'reward_app_users',
  lists: 'reward_app_lists',
  rewards: 'reward_app_rewards',
  invitations: 'reward_app_invitations',
  currentUser: 'reward_app_current_user',
  credentials: 'reward_app_credentials',
};

async function sha256Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(salt + password + salt);
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

type CredEntry = { salt: string; hash: string; userId: string };

function getCredentials(): Record<string, CredEntry> {
  return loadJson<Record<string, CredEntry>>(KEYS.credentials, {});
}

export function getUsers(): User[] {
  return loadJson<User[]>(KEYS.users, []);
}

function saveUsers(users: User[]): void {
  saveJson(KEYS.users, users);
}

export function getUserById(id: string): User | undefined {
  return getUsers().find(u => u.id === id);
}

export function getUserByUsername(username: string): User | undefined {
  return getUsers().find(u => u.username === username);
}

export function getCurrentUser(): User | null {
  const data = localStorage.getItem(KEYS.currentUser);
  return data ? JSON.parse(data) : null;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(KEYS.currentUser, JSON.stringify(user));
  } else {
    localStorage.removeItem(KEYS.currentUser);
  }
}

const ADMIN_USERNAME = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'admin';

export async function initStore(): Promise<void> {
  // Auto-create the admin account on first run if it doesn't exist
  const creds = getCredentials();
  if (!creds[ADMIN_USERNAME]) {
    const salt = genId() + genId();
    const hash = await hashPassword(ADMIN_DEFAULT_PASSWORD, salt);
    const userId = 'admin-' + genId();
    // Admin user is NOT stored in the regular users list (they don't appear in user search)
    creds[ADMIN_USERNAME] = { salt, hash, userId };
    saveJson(KEYS.credentials, creds);
  }
}

export async function registerUser(username: string, password: string, displayName: string, avatarColor: string): Promise<User | string> {
  const existing = getUserByUsername(username);
  if (existing) return '用户名已存在';
  const salt = genId() + genId();
  const hash = await hashPassword(password, salt);
  const userId = genId();
  const user: User = { id: userId, username, displayName, avatarColor };
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  const creds = getCredentials();
  creds[username] = { salt, hash, userId };
  saveJson(KEYS.credentials, creds);
  return user;
}

export async function loginUser(username: string, password: string): Promise<User | string> {
  const creds = getCredentials();
  const entry = creds[username];
  if (!entry) return '用户名或密码错误';
  const hash = await hashPassword(password, entry.salt);
  if (hash !== entry.hash) return '用户名或密码错误';
  // Admin login: return a synthetic user object
  if (username === ADMIN_USERNAME) {
    return { id: entry.userId, username: ADMIN_USERNAME, displayName: '管理员', avatarColor: 'bg-slate-700' };
  }
  const user = getUserById(entry.userId);
  if (!user) return '用户数据错误';
  return user;
}

export async function findUserByUsername(username: string): Promise<User | string> {
  const user = getUserByUsername(username);
  if (user) return user;
  return '找不到该用户';
}

export function getLists(): RewardList[] {
  return loadJson<RewardList[]>(KEYS.lists, []);
}

function saveLists(lists: RewardList[]): void {
  saveJson(KEYS.lists, lists);
}

export function createList(name: string, description: string, ownerId: string): RewardList {
  const lists = getLists();
  const list: RewardList = { id: genId(), name, description, ownerId, rewarderIds: [], createdAt: Date.now() };
  lists.push(list);
  saveLists(lists);
  return list;
}

export function getListById(id: string): RewardList | undefined {
  return getLists().find(l => l.id === id);
}

export function getListsByOwner(ownerId: string): RewardList[] {
  return getLists().filter(l => l.ownerId === ownerId);
}

export function getListsByRewarder(rewarderId: string): RewardList[] {
  return getLists().filter(l => l.rewarderIds.includes(rewarderId));
}

export function addRewarderToList(listId: string, rewarderId: string): boolean {
  const lists = getLists();
  const list = lists.find(l => l.id === listId);
  if (!list || list.rewarderIds.includes(rewarderId)) return false;
  list.rewarderIds.push(rewarderId);
  saveLists(lists);
  return true;
}

export function removeRewarderFromList(listId: string, rewarderId: string): void {
  const lists = getLists();
  const list = lists.find(l => l.id === listId);
  if (!list) return;
  list.rewarderIds = list.rewarderIds.filter(id => id !== rewarderId);
  saveLists(lists);
}

export function deleteList(listId: string): void {
  saveLists(getLists().filter(l => l.id !== listId));
  saveJson(KEYS.rewards, getRewards().filter(r => r.listId !== listId));
  saveJson(KEYS.invitations, getInvitations().filter(i => i.listId !== listId));
}

export function getRewards(): Reward[] {
  return loadJson<Reward[]>(KEYS.rewards, []);
}

export function createReward(listId: string, rewarderId: string, category: RewardCategory, title: string, description: string, amount?: number): Reward {
  const rewards = getRewards();
  const reward: Reward = { id: genId(), listId, rewarderId, category, title, description, amount, status: 'pending', createdAt: Date.now() };
  rewards.push(reward);
  saveJson(KEYS.rewards, rewards);
  return reward;
}

export function getRewardsByList(listId: string): Reward[] {
  return getRewards().filter(r => r.listId === listId);
}

export function updateRewardStatus(rewardId: string, status: RewardStatus): void {
  const rewards = getRewards();
  const reward = rewards.find(r => r.id === rewardId);
  if (reward) {
    reward.status = status;
    saveJson(KEYS.rewards, rewards);
  }
}

export function deleteReward(rewardId: string): void {
  saveJson(KEYS.rewards, getRewards().filter(r => r.id !== rewardId));
}

export function getInvitations(): Invitation[] {
  return loadJson<Invitation[]>(KEYS.invitations, []);
}

export function createInvitation(listId: string, listName: string, fromUserId: string, toUserId: string): Invitation | string {
  const invitations = getInvitations();
  const existing = invitations.find(i =>
    i.listId === listId && i.toUserId === toUserId && (i.status === 'pending' || i.status === 'accepted')
  );
  if (existing) return '已经邀请过该用户';
  const list = getListById(listId);
  if (list && list.rewarderIds.includes(toUserId)) return '该用户已经是奖励人';
  const invitation: Invitation = { id: genId(), listId, listName, fromUserId, toUserId, status: 'pending', createdAt: Date.now() };
  invitations.push(invitation);
  saveJson(KEYS.invitations, invitations);
  return invitation;
}

export async function respondToInvitation(invitationId: string, response: 'accepted' | 'rejected'): Promise<void> {
  const invitations = getInvitations();
  const invitation = invitations.find(i => i.id === invitationId);
  if (!invitation) return;
  invitation.status = response;
  if (response === 'accepted') {
    addRewarderToList(invitation.listId, invitation.toUserId);
  }
  saveJson(KEYS.invitations, invitations);
}

export function getPendingInvitations(userId: string): Invitation[] {
  return getInvitations().filter(i => i.toUserId === userId && i.status === 'pending');
}

export async function seedDemoData(_currentUserId: string): Promise<void> {}

export async function loadAdminUsers(): Promise<User[]> {
  return getUsers();
}

export async function adminCreateUser(username: string, password: string, displayName: string): Promise<string | null> {
  if (username === ADMIN_USERNAME) return '不能使用保留用户名';
  const existing = getUserByUsername(username);
  if (existing) return '用户名已存在';
  const salt = genId() + genId();
  const hash = await hashPassword(password, salt);
  const userId = genId();
  const user: User = { id: userId, username, displayName, avatarColor: 'bg-blue-500' };
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  const creds = getCredentials();
  creds[username] = { salt, hash, userId };
  saveJson(KEYS.credentials, creds);
  return null;
}

export async function adminUpdateUser(id: string, patch: { password?: string; displayName?: string }): Promise<string | null> {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user) return '用户不存在';
  if (patch.displayName !== undefined) {
    user.displayName = patch.displayName;
    saveUsers(users);
  }
  if (patch.password && patch.password.trim()) {
    const creds = getCredentials();
    const entry = creds[user.username];
    if (entry) {
      const salt = genId() + genId();
      const hash = await hashPassword(patch.password.trim(), salt);
      creds[user.username] = { salt, hash, userId: id };
      saveJson(KEYS.credentials, creds);
    }
  }
  return null;
}

export async function adminDeleteUser(id: string): Promise<string | null> {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user) return '用户不存在';
  // Remove credentials
  const creds = getCredentials();
  delete creds[user.username];
  saveJson(KEYS.credentials, creds);
  // Remove user
  saveUsers(users.filter(u => u.id !== id));
  // Clean up lists owned by this user
  const lists = getLists();
  const ownedListIds = lists.filter(l => l.ownerId === id).map(l => l.id);
  saveLists(lists.filter(l => l.ownerId !== id).map(l => ({
    ...l,
    rewarderIds: l.rewarderIds.filter(rid => rid !== id),
  })));
  // Clean up rewards in owned lists, and rewards added by this user
  saveJson(KEYS.rewards, getRewards().filter(r => !ownedListIds.includes(r.listId) && r.rewarderId !== id));
  // Clean up invitations
  saveJson(KEYS.invitations, getInvitations().filter(i => i.fromUserId !== id && i.toUserId !== id && !ownedListIds.includes(i.listId)));
  return null;
}

// ===================== Backup & Restore =====================

export async function exportBackup(password: string): Promise<Uint8Array> {
  const snapshot: Record<string, unknown> = {};
  for (const key of Object.values(KEYS)) {
    const val = localStorage.getItem(key);
    if (val) snapshot[key] = JSON.parse(val);
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));

  const passwordKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    passwordKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);

  // Format: [magic 4 bytes][salt 16 bytes][iv 12 bytes][ciphertext]
  const magic = new Uint8Array([0x52, 0x4C, 0x42, 0x4B]); // RLBK
  const result = new Uint8Array(4 + 16 + 12 + ciphertext.byteLength);
  result.set(magic, 0);
  result.set(salt, 4);
  result.set(iv, 20);
  result.set(new Uint8Array(ciphertext), 32);
  return result;
}

export async function importBackup(data: Uint8Array, password: string): Promise<string | null> {
  try {
    if (data[0] !== 0x52 || data[1] !== 0x4C || data[2] !== 0x42 || data[3] !== 0x4B) {
      return '文件格式不正确，请选择有效的备份文件';
    }
    const salt = data.slice(4, 20);
    const iv = data.slice(20, 32);
    const ciphertext = data.slice(32);

    const passwordKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      passwordKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    const snapshot = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;

    for (const [key, value] of Object.entries(snapshot)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    return null;
  } catch {
    return '解密失败，密码可能不正确';
  }
}

// ===================== Excel Export/Import =====================

export function exportUserDataExcel(userId: string): Blob {
  const lists = getListsByOwner(userId);
  const allRewards = getRewards();
  const users = getUsers();

  const rows: Record<string, string>[] = [];

  for (const list of lists) {
    const rewards = allRewards.filter(r => r.listId === list.id);
    for (const reward of rewards) {
      const rewarder = users.find(u => u.id === reward.rewarderId);
      const categoryMap: Record<string, string> = { money: '金钱', gift: '礼物', emotional: '情绪价值' };
      const statusMap: Record<string, string> = { pending: '待兑现', claimed: '已申请', fulfilled: '已兑现' };
      rows.push({
        '清单名称': list.name,
        '奖励标题': reward.title,
        '类型': categoryMap[reward.category] || reward.category,
        '金额': reward.category === 'money' && reward.amount ? String(reward.amount) : '',
        '描述': reward.description || '',
        '状态': statusMap[reward.status] || reward.status,
        '奖励人': rewarder?.displayName || '未知',
        '创建时间': new Date(reward.createdAt).toLocaleString('zh-CN'),
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '我的奖励');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function importUserDataFromExcel(
  file: File,
  userId: string,
): Promise<{ imported: number; listName: string; error: string | null }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

        const categoryReverseMap: Record<string, RewardCategory> = {
          '金钱': 'money', '礼物': 'gift', '情绪价值': 'emotional',
        };
        const statusReverseMap: Record<string, RewardStatus> = {
          '待兑现': 'pending', '已申请': 'claimed', '已兑现': 'fulfilled',
        };

        const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        const importListName = `导入-${dateStr}`;
        const newList = createList(importListName, '从Excel导入的奖励数据', userId);

        const rewards = getRewards();
        let imported = 0;
        for (const row of rows) {
          const title = row['奖励标题'] || row['title'] || '';
          if (!title) continue;
          const category = categoryReverseMap[row['类型']] || 'gift';
          const status = statusReverseMap[row['状态']] || 'pending';
          const amount = category === 'money' && row['金额'] ? parseFloat(row['金额']) : undefined;
          const reward: Reward = {
            id: genId(),
            listId: newList.id,
            rewarderId: userId,
            category,
            title,
            description: row['描述'] || '',
            amount,
            status,
            createdAt: Date.now(),
          };
          rewards.push(reward);
          imported++;
        }
        saveJson(KEYS.rewards, rewards);
        resolve({ imported, listName: importListName, error: null });
      } catch (err) {
        resolve({ imported: 0, listName: '', error: '解析Excel文件失败: ' + (err instanceof Error ? err.message : String(err)) });
      }
    };
    reader.onerror = () => resolve({ imported: 0, listName: '', error: '读取文件失败' });
    reader.readAsArrayBuffer(file);
  });
}

// ===================== Version Check =====================

export const GITCODE_RELEASE_URL = 'https://gitcode.com/yudixianzong/RewardList-Android/releases';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  releasePageUrl: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      'https://gitcode.com/api/v5/repos/yudixianzong/RewardList-Android/releases?per_page=1',
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const releases = await res.json() as Array<{ tag_name: string }>;
    if (!releases.length) return null;
    const latestVersion = releases[0].tag_name.replace(/^v/, '');
    const hasUpdate = latestVersion !== APP_VERSION;
    return { hasUpdate, latestVersion, releasePageUrl: GITCODE_RELEASE_URL };
  } catch {
    return null;
  }
}
