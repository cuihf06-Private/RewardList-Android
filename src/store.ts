import type { User, RewardList, Reward, Invitation, RewardCategory, RewardStatus } from './types';

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

export async function initStore(): Promise<void> {}

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
export async function loadAdminUsers(): Promise<User[]> { return []; }
export async function adminCreateUser(_username: string, _password: string, _displayName: string): Promise<string | null> { return '单机版不支持管理员功能'; }
export async function adminUpdateUser(_id: string, _patch: { password?: string; displayName?: string }): Promise<string | null> { return null; }
export async function adminDeleteUser(_id: string): Promise<string | null> { return null; }
