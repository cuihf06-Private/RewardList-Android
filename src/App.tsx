import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ListOrdered, Gift, BarChart3, User as UserIcon, Plus, ArrowLeft, Trophy, ClipboardList, FileText, Activity, Banknote, RefreshCw,
  Send, X, Trash2, Bell, LogOut, Sparkles, ChevronRight, Users, Info,
  ChevronDown, ChevronUp, Download, Upload, Shield, Share2, RefreshCcw
} from 'lucide-react';
import type { User as UserType, Reward, RewardCategory, RewardStatus } from './types';
import * as store from './store';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ---- File save + share helper ----
// Saves a Blob/Uint8Array to Downloads, shows its path, then shares via native share sheet
async function saveAndShare(
  data: Blob | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<{ path: string; error?: string }> {
  // Convert to base64
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  try {
    // Directory.ExternalStorage = /storage/emulated/0/ (公共外部存储根目录)
    // path 加 Download/ 前缀即存入公共 Downloads 文件夹
    const result = await Filesystem.writeFile({
      path: `Download/${fileName}`,
      data: base64,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
    return { path: result.uri };
  } catch {
    // Fallback: app 私有外部目录
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.External,
        recursive: true,
      });
      return { path: result.uri };
    } catch (err2) {
      return { path: '', error: String(err2) };
    }
  }
}

async function shareFile(uri: string, title: string): Promise<void> {
  try {
    await Share.share({ title, url: uri, dialogTitle: '分享文件' });
  } catch {
    // User cancelled or share not available — ignore
  }
}

// ===================== Constants =====================

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-slate-500',
];

const CATEGORY_CONFIG: Record<RewardCategory, {
  label: string; icon: React.ReactNode; color: string; bgColor: string; borderColor: string;
}> = {
  money: { label: '金钱', icon: <span className="text-xl font-bold">¥</span>, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  gift: { label: '礼物', icon: <Gift size={20} />, color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-violet-200' },
  emotional: { label: '情绪价值', icon: <Activity size={20} />, color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
};

const STATUS_CONFIG: Record<RewardStatus, { label: string; bgColor: string; textColor: string }> = {
  pending: { label: '待兑现', bgColor: 'bg-indigo-100', textColor: 'text-indigo-800' },
  claimed: { label: '已申请', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  fulfilled: { label: '已兑现', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' },
};

const STATUS_FLOW: RewardStatus[] = ['pending', 'claimed', 'fulfilled'];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ===================== Navigation Types =====================

type Tab = 'myLists' | 'asRewarder' | 'summary' | 'profile';
type View = 'auth' | 'main' | 'listDetail';
type AuthMode = 'login' | 'register';
type ModalType = 'createList' | 'addReward' | 'invite' | null;

// ===================== Update Banner =====================

// ===================== Update Check Section =====================

async function downloadApk(info: store.UpdateInfo, setStatus: (s: string) => void): Promise<void> {
  setStatus('正在连接 GitCode…');
  // Try GitCode first
  if (info.gitcodeApkUrl) {
    try {
      const res = await fetch(info.gitcodeApkUrl, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        setStatus('正在从 GitCode 下载，请稍候…');
        window.open(info.gitcodeApkUrl, '_system');
        return;
      }
    } catch { /* fallthrough */ }
  }
  // Fallback to GitHub
  if (info.githubApkUrl) {
    setStatus('GitCode 不可用，正在从 GitHub 下载…');
    window.open(info.githubApkUrl, '_system');
    return;
  }
  setStatus('无法获取下载链接，请稍后重试。');
}

function UpdateCheckSection() {
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<store.UpdateInfo | null>(null);
  const [checkMsg, setCheckMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [dlStatus, setDlStatus] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setCheckMsg('');
    setInfo(null);
    setDlStatus('');
    const result = await store.checkForUpdate();
    setChecking(false);
    if (!result) {
      setCheckMsg('检测失败，请检查网络连接后重试。');
      return;
    }
    setInfo(result);
    if (result.hasUpdate) {
      setShowConfirm(true);
    } else {
      setCheckMsg(`当前已是最新版本 v${result.currentVersion}`);
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    setShowConfirm(false);
    setDownloading(true);
    await downloadApk(info, setDlStatus);
    setDownloading(false);
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
        <Sparkles size={15} className="text-indigo-500" />关于与更新
      </h3>
      <p className="text-xs text-gray-500 mb-3">当前版本：v{store.APP_VERSION}</p>

      {checkMsg && (
        <div className={`mb-3 p-2.5 rounded-lg text-sm ${checkMsg.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {checkMsg}
        </div>
      )}

      {dlStatus && (
        <div className="mb-3 p-2.5 rounded-lg text-sm bg-indigo-50 text-indigo-700">{dlStatus}</div>
      )}

      {/* Confirm download dialog */}
      {showConfirm && info && (
        <div className="mb-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
          <p className="text-sm font-bold text-indigo-800 mb-1">🎉 发现新版本 v{info.latestVersion}</p>
          <p className="text-xs text-indigo-600 mb-3">当前版本 v{info.currentVersion}，是否立即下载安装？</p>
          <div className="flex gap-2">
            <button onClick={() => void handleDownload()}
              className="flex-1 bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
              <Download size={14} /> 立即下载
            </button>
            <button onClick={() => setShowConfirm(false)}
              className="flex-1 bg-white text-indigo-600 text-sm font-medium py-2 rounded-lg border border-indigo-200">
              稍后再说
            </button>
          </div>
        </div>
      )}

      <button onClick={() => void handleCheck()} disabled={checking || downloading}
        className="w-full bg-indigo-50 text-indigo-700 rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
        <RefreshCcw size={14} className={checking ? 'animate-spin' : ''} />
        {checking ? '检测中…' : '检测新版本'}
      </button>
    </div>
  );
}

// ===================== Login View =====================

function LoginView({ onLogin, onGoRegister }: { onLogin: (user: UserType) => void; onGoRegister: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await store.loginUser(username, password);
    if (typeof result === 'string') {
      setError(result);
    } else {
      onLogin(result);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="mb-6 bg-indigo-100 p-5 rounded-full inline-flex items-center justify-center"><Trophy size={48} className="text-indigo-600" /></div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">奖励存折</h1>
      <p className="text-gray-500 mb-10 text-sm">记录每一份奖励，积累每一份期待</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center flex items-center justify-center gap-2">
            <Info size={14} /> {error}
          </div>
        )}
        <input type="text" placeholder="用户名" value={username}
          onChange={e => setUsername(e.target.value)} autoComplete="username"
          className="w-full border border-gray-200 rounded-xl py-3 px-4 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
        <input type="password" placeholder="密码" value={password}
          onChange={e => setPassword(e.target.value)} autoComplete="current-password"
          className="w-full border border-gray-200 rounded-xl py-3 px-4 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
        <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-lg shadow-indigo-200">
          登录
        </button>
        <button type="button" onClick={onGoRegister} className="w-full text-indigo-800 py-3 font-medium hover:text-amber-800 transition-colors">
          没有账户？注册一个
        </button>
      </form>
    </div>
  );
}

// ===================== Register View =====================

function RegisterView({ onRegister, onGoLogin }: { onRegister: (user: UserType) => void; onGoLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState('bg-blue-500');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim() || !displayName.trim()) { setError('请填写所有字段'); return; }
    if (password.length < 4) { setError('密码至少4位'); return; }
    const result = await store.registerUser(username.trim(), password.trim(), displayName.trim(), avatarColor);
    if (typeof result === 'string') { setError(result); } else { onRegister(result); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="mb-6 bg-indigo-100 p-4 rounded-full inline-flex items-center justify-center"><UserIcon size={40} className="text-indigo-600" /></div>
      <h1 className="text-2xl font-bold text-gray-800 mb-5">创建新账户</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center flex items-center justify-center gap-2">
            <Info size={14} /> {error}
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-2 block">选择头像</label>
          <div className="flex flex-wrap gap-2 bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-gray-200">
            {AVATAR_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setAvatarColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${c} ${avatarColor === c ? 'scale-110 ring-2 ring-offset-2 ring-indigo-400' : 'opacity-80 hover:opacity-100'}`} />
            ))}
          </div>
        </div>
        <input type="text" placeholder="用户名（登录用）" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"
          className="w-full border border-gray-200 rounded-xl py-3 px-4 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <input type="password" placeholder="密码（至少4位）" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
          className="w-full border border-gray-200 rounded-xl py-3 px-4 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <input type="text" placeholder="显示名称" value={displayName} onChange={e => setDisplayName(e.target.value)}
          className="w-full border border-gray-200 rounded-xl py-3 px-4 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">注册</button>
        <button type="button" onClick={onGoLogin} className="w-full text-indigo-800 py-2 font-medium hover:text-amber-800">已有账户？去登录</button>
      </form>
    </div>
  );
}

// ===================== Create List Modal =====================

function CreateListModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const user = store.getCurrentUser();
    if (!user) return;
    store.createList(name.trim(), description.trim(), user.id);
    onCreated(); onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800">创建新清单</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">清单名称 *</label>
            <input type="text" placeholder="例如：学费、运动奖励" value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">描述（可选）</label>
            <textarea placeholder="清单的用途说明" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 transition-colors">创建清单</button>
        </form>
      </div>
    </div>
  );
}

// ===================== Add Reward Modal =====================

function AddRewardModal({ listId, onClose, onAdded }: { listId: string; onClose: () => void; onAdded: () => void }) {
  const [category, setCategory] = useState<RewardCategory>('money');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const user = store.getCurrentUser();
    if (!user) return;
    const parsedAmount = category === 'money' ? parseFloat(amount) || 0 : undefined;
    store.createReward(listId, user.id, category, title.trim(), description.trim(), parsedAmount);
    onAdded(); onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800">添加奖励</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-2 block">奖励类别</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_CONFIG) as RewardCategory[]).map(key => {
                const cfg = CATEGORY_CONFIG[key];
                return (
                  <button key={key} type="button" onClick={() => setCategory(key)}
                    className={`py-3 px-2 rounded-xl border-2 transition-all text-center ${category === key ? `${cfg.borderColor} ${cfg.bgColor} ring-2 ring-offset-1 ring-indigo-400` : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <div className="text-2xl mb-1">{cfg.icon}</div>
                    <div className={`text-sm font-medium ${category === key ? cfg.color : 'text-gray-600'}`}>{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {category === 'money' && (
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">金额（元）</label>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus
                className="w-full border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" min="0" step="0.01" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">标题 *</label>
            <input type="text"
              placeholder={category === 'money' ? '例如：期中考试奖励' : category === 'gift' ? '例如：生日礼物' : '例如：为你骄傲'}
              value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">描述（可选）</label>
            <textarea placeholder="补充说明" value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 transition-colors">添加奖励</button>
        </form>
      </div>
    </div>
  );
}

// ===================== Invite Modal =====================

function InviteModal({ listId, onClose, onInvited }: { listId: string; onClose: () => void; onInvited: () => void }) {
  const [searchUsername, setSearchUsername] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const list = store.getListById(listId);

  const handleInvite = async () => {
    if (!searchUsername.trim()) return;
    const currentUser = store.getCurrentUser();
    if (!currentUser) return;
    const targetUser = await store.findUserByUsername(searchUsername.trim());
    if (typeof targetUser === 'string') { setMessage({ text: targetUser, type: 'error' }); return; }
    if (targetUser.id === currentUser.id) {
      const ok = store.addRewarderToList(listId, currentUser.id);
      setMessage({ text: ok ? '已将自己添加为奖励人' : '你已经是奖励人了', type: ok ? 'success' : 'error' });
      setSearchUsername('');
      if (ok) onInvited();
      return;
    }
    const result = store.createInvitation(listId, list?.name || '', currentUser.id, targetUser.id);
    if (typeof result === 'string') {
      setMessage({ text: result, type: 'error' });
    } else {
      setMessage({ text: `已向 ${targetUser.displayName} 发送邀请`, type: 'success' });
      setSearchUsername('');
      onInvited();
    }
  };

  const currentRewarders = (list?.rewarderIds || []).map(id => store.getUserById(id)).filter(Boolean) as UserType[];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800">管理奖励人</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        {currentRewarders.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-medium text-gray-600 mb-2">当前奖励人</h3>
            <div className="space-y-2">
              {currentRewarders.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center rounded-full text-white font-bold w-10 h-10 ${u?.avatarColor || 'bg-blue-500'}`}><span className="text-base">{u?.displayName?.charAt(0) || 'U'}</span></div>
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{u.displayName}</div>
                      <div className="text-xs text-gray-400">@{u.username}</div>
                    </div>
                  </div>
                  <button onClick={() => { store.removeRewarderFromList(listId, u.id); onInvited(); }}
                    className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="text-sm font-medium text-gray-600 mb-2">按用户名邀请</h3>
          <div className="flex gap-2">
            <input type="text" placeholder="输入用户名" value={searchUsername}
              onChange={e => { setSearchUsername(e.target.value); setMessage(null); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleInvite(); }}
              className="flex-1 border border-gray-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={() => void handleInvite()} className="bg-indigo-600 text-white rounded-xl px-4 hover:bg-indigo-700 transition-colors flex items-center">
              <Send size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">💡 输入自己的用户名可以将自己添加为奖励人</p>
          {message && (
            <div className={`mt-2 text-sm p-2.5 rounded-lg ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== Reward Card =====================

function RewardCard({ reward, isOwner, isRewarder, onRefresh }: {
  reward: Reward; isOwner: boolean; isRewarder: boolean; onRefresh: () => void;
}) {
  const catCfg = CATEGORY_CONFIG[reward.category];
  const statusCfg = STATUS_CONFIG[reward.status];
  const rewarder = store.getUserById(reward.rewarderId);

  const cycleStatus = () => {
    const idx = STATUS_FLOW.indexOf(reward.status);
    const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
    store.updateRewardStatus(reward.id, next);
    onRefresh();
  };

  const handleDelete = () => {
    store.deleteReward(reward.id);
    onRefresh();
  };

  return (
    <div className={`bg-white rounded-2xl p-4 border ${catCfg.borderColor} shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${catCfg.bgColor} flex items-center justify-center text-lg shrink-0`}>
          {catCfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-800 text-sm leading-tight">{reward.title}</h3>
              {reward.category === 'money' && reward.amount != null && (
                <span className={`font-bold text-base ${catCfg.color}`}>¥{reward.amount.toFixed(2)}</span>
              )}
            </div>
            <button onClick={cycleStatus}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bgColor} ${statusCfg.textColor} hover:opacity-80 transition-opacity shrink-0`}>
              {statusCfg.label}
            </button>
          </div>
          {reward.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{reward.description}</p>}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>{rewarder?.displayName}</span>
              <span>·</span>
              <span>{formatDate(reward.createdAt)}</span>
            </div>
            {(isOwner || isRewarder) && (
              <button onClick={handleDelete} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {isOwner && reward.status === 'pending' && (
            <button onClick={cycleStatus} className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium">申请兑现 →</button>
          )}
          {isRewarder && reward.status === 'claimed' && (
            <button onClick={cycleStatus} className="mt-2 text-xs text-emerald-500 hover:text-emerald-600 font-medium">确认已兑现 ✓</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== My Lists Tab =====================

function MyListsTab({ onOpenList, onCreateList }: {
  onOpenList: (id: string) => void; onCreateList: () => void;
}) {
  const user = store.getCurrentUser();
  if (!user) return null;
  const lists = store.getListsByOwner(user.id);

  return (
    <div className="p-4 space-y-3">
      {lists.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-4 inline-flex p-4 bg-gray-100 text-gray-400 rounded-full"><ClipboardList size={48} /></div>
          <p className="text-gray-600 mb-1 font-medium">还没有清单</p>
          <p className="text-sm text-gray-400 mb-6">创建一个清单来开始记录奖励</p>
          <button onClick={onCreateList}
            className="bg-indigo-600 text-white rounded-xl py-2.5 px-6 font-medium hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 shadow-lg shadow-indigo-200">
            <Plus size={18} /> 创建清单
          </button>
        </div>
      ) : (
        <>
          {lists.map(list => {
            const rewards = store.getRewardsByList(list.id);
            const totalMoney = rewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
            const giftCount = rewards.filter(r => r.category === 'gift').length;
            const emotionalCount = rewards.filter(r => r.category === 'emotional').length;
            const pendingCount = rewards.filter(r => r.status !== 'fulfilled').length;
            return (
              <button key={list.id} onClick={() => onOpenList(list.id)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all text-left border border-gray-100 active:scale-[0.98]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg text-gray-800">{list.name}</h3>
                  <ChevronRight size={20} className="text-gray-300" />
                </div>
                {list.description && <p className="text-sm text-gray-500 mb-3 line-clamp-1">{list.description}</p>}
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  {totalMoney > 0 && <span className="text-emerald-600 font-medium"><Banknote size={14} className="inline mr-1 -mt-0.5" />¥{totalMoney.toFixed(0)}</span>}
                  {giftCount > 0 && <span className="text-violet-600"><Gift size={14} className="inline mr-1" />{giftCount}件</span>}
                  {emotionalCount > 0 && <span className="text-rose-600"><Activity size={14} className="inline mr-1" />{emotionalCount}条</span>}
                  {rewards.length === 0 && <span className="text-gray-400">暂无奖励</span>}
                  {pendingCount > 0 && <span className="ml-auto bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs font-medium">{pendingCount}待兑现</span>}
                </div>
                <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                  <span>{list.rewarderIds.length} 位奖励人</span><span>·</span><span>{formatDateShort(list.createdAt)}</span>
                </div>
              </button>
            );
          })}
          <button onClick={onCreateList}
            className="w-full border-2 border-dashed border-indigo-300 rounded-2xl p-4 text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 font-medium">
            <Plus size={20} /> 创建新清单
          </button>
        </>
      )}
    </div>
  );
}

// ===================== As Rewarder Tab =====================

function AsRewarderTab({ onOpenList, onRefresh }: {
  onOpenList: (id: string) => void; onRefresh: () => void;
}) {
  const user = store.getCurrentUser();
  if (!user) return null;
  const lists = store.getListsByRewarder(user.id);
  const pendingInvitations = store.getPendingInvitations(user.id);

  return (
    <div className="p-4 space-y-4">
      {pendingInvitations.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-2">
            <Bell size={16} className="text-indigo-600" />
            收到的邀请
            <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{pendingInvitations.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingInvitations.map(inv => {
              const fromUser = store.getUserById(inv.fromUserId);
              return (
                <div key={inv.id} className="bg-gray-50 border border-indigo-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`flex items-center justify-center rounded-full text-white font-bold w-10 h-10 ${fromUser?.avatarColor || 'bg-blue-500'}`}><span className="text-base">{fromUser?.displayName?.charAt(0) || 'U'}</span></div>
                    <div>
                      <span className="font-medium text-gray-800 text-sm">{fromUser?.displayName}</span>
                      <span className="text-gray-500 text-sm"> 邀请你成为奖励人</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">清单：<span className="font-semibold">{inv.listName}</span></div>
                  <div className="flex gap-2">
                    <button onClick={async () => { await store.respondToInvitation(inv.id, 'accepted'); onRefresh(); }}
                      className="flex-1 bg-emerald-500 text-white rounded-xl py-2 font-medium hover:bg-emerald-600 transition-colors text-sm">接受邀请</button>
                    <button onClick={async () => { await store.respondToInvitation(inv.id, 'rejected'); onRefresh(); }}
                      className="flex-1 bg-white text-gray-600 rounded-xl py-2 font-medium hover:bg-gray-100 transition-colors text-sm border border-gray-200">婉拒</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-2">我作为奖励人的清单</h2>
        {lists.length === 0 && pendingInvitations.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4 inline-flex p-4 bg-gray-100 text-gray-400 rounded-full"><Gift size={40} /></div>
            <p className="text-gray-500 text-sm">还没有成为任何清单的奖励人</p>
            <p className="text-xs text-gray-400 mt-1">等待别人的邀请吧</p>
          </div>
        ) : lists.length === 0 ? null : (
          <div className="space-y-2">
            {lists.map(list => {
              const rewards = store.getRewardsByList(list.id);
              const owner = store.getUserById(list.ownerId);
              const myRewards = rewards.filter(r => r.rewarderId === user.id);
              const totalMoney = rewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
              return (
                <button key={list.id} onClick={() => onOpenList(list.id)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-left border border-gray-100 active:scale-[0.98]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-gray-800">{list.name}</h3>
                    <ChevronRight size={20} className="text-gray-300" />
                  </div>
                  <div className="text-sm text-gray-500 mb-1">{owner?.displayName} 的清单</div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>我已添加 {myRewards.length} 条奖励</span><span>·</span><span>共 {rewards.length} 条</span>
                    {totalMoney > 0 && <span> · <Banknote size={14} className="inline mr-1 -mt-0.5" />¥{totalMoney.toFixed(0)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ===================== Summary Tab =====================

function SummaryTab() {
  const user = store.getCurrentUser();
  if (!user) return null;
  const ownedLists = store.getListsByOwner(user.id);
  const rewarderLists = store.getListsByRewarder(user.id);
  const allLists = [...ownedLists, ...rewarderLists.filter(l => !ownedLists.find(ol => ol.id === l.id))];
  const allRewards = allLists.flatMap(l => store.getRewardsByList(l.id));

  if (allLists.length === 0) {
    return (
      <div className="p-4 text-center py-16">
        <div className="mb-4 inline-flex p-4 bg-gray-100 text-gray-400 rounded-full"><BarChart3 size={48} /></div>
        <p className="text-gray-500">暂无数据</p>
        <p className="text-sm text-gray-400 mt-1">创建或加入清单后即可查看汇总</p>
      </div>
    );
  }

  const moneyTotal = allRewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
  const giftCount = allRewards.filter(r => r.category === 'gift').length;
  const emotionalCount = allRewards.filter(r => r.category === 'emotional').length;
  const totalCount = allRewards.length;
  const pendingCount = allRewards.filter(r => r.status === 'pending').length;
  const claimedCount = allRewards.filter(r => r.status === 'claimed').length;
  const fulfilledCount = allRewards.filter(r => r.status === 'fulfilled').length;

  const rewarderMap = new Map<string, Reward[]>();
  allRewards.forEach(r => { const arr = rewarderMap.get(r.rewarderId) || []; arr.push(r); rewarderMap.set(r.rewarderId, arr); });

  const listStats = allLists.map(l => {
    const rewards = store.getRewardsByList(l.id);
    const money = rewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
    const gifts = rewards.filter(r => r.category === 'gift').length;
    const emotional = rewards.filter(r => r.category === 'emotional').length;
    const isOwner = l.ownerId === user.id;
    return { list: l, money, gifts, emotional, total: rewards.length, isOwner };
  });

  return (
    <div className="p-4 space-y-4">
      <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg">
        <h2 className="font-bold text-lg mb-4 opacity-90">全部汇总</h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><div className="text-2xl font-bold">{totalCount}</div><div className="text-[10px] opacity-80">总奖励</div></div>
          <div><div className="text-2xl font-bold">¥{moneyTotal >= 10000 ? `${(moneyTotal / 10000).toFixed(1)}w` : moneyTotal.toFixed(0)}</div><div className="text-[10px] opacity-80">金钱</div></div>
          <div><div className="text-2xl font-bold">{giftCount}</div><div className="text-[10px] opacity-80">礼物</div></div>
          <div><div className="text-2xl font-bold">{emotionalCount}</div><div className="text-[10px] opacity-80">情绪</div></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-3 text-sm">按状态</h3>
        <div className="flex gap-2">
          <div className="flex-1 bg-indigo-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-indigo-700">{pendingCount}</div><div className="text-[10px] text-indigo-700 font-medium">待兑现</div>
          </div>
          <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-blue-600">{claimedCount}</div><div className="text-[10px] text-blue-600 font-medium">已申请</div>
          </div>
          <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-emerald-600">{fulfilledCount}</div><div className="text-[10px] text-emerald-600 font-medium">已兑现</div>
          </div>
        </div>
      </div>

      {rewarderMap.size > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">按奖励人汇总</h3>
          <div className="space-y-2.5">
            {Array.from(rewarderMap.entries()).map(([rewarderId, rewards]) => {
              const rUser = store.getUserById(rewarderId);
              const money = rewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
              const gifts = rewards.filter(r => r.category === 'gift').length;
              const emotional = rewards.filter(r => r.category === 'emotional').length;
              const fulfilled = rewards.filter(r => r.status === 'fulfilled').length;
              return (
                <div key={rewarderId} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex items-center justify-center rounded-full text-white font-bold w-9 h-9 ${rUser?.avatarColor || 'bg-blue-500'}`}><span className="text-sm">{rUser?.displayName?.charAt(0) || 'U'}</span></div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{rUser?.displayName || '未知'}</div>
                      <div className="text-[10px] text-gray-400">{rewards.length}条 · {fulfilled}已兑现</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {money > 0 && <span className="text-emerald-600 font-medium">¥{money.toFixed(0)}</span>}
                    {gifts > 0 && <span className="text-violet-600"><Gift size={14} className="inline mr-1 -mt-0.5" />{gifts}</span>}
                    {emotional > 0 && <span className="text-rose-600"><Activity size={14} className="inline mr-1 -mt-0.5" />{emotional}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {listStats.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">按清单汇总</h3>
          <div className="space-y-3">
            {listStats.map(({ list: l, money, gifts, emotional, total, isOwner }) => (
              <div key={l.id} className="py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-700">{l.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isOwner ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isOwner ? '主人' : '奖励人'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{total}条</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {money > 0 && <span className="text-emerald-600"><Banknote size={14} className="inline mr-1 -mt-0.5" />¥{money.toFixed(0)}</span>}
                  {gifts > 0 && <span className="text-violet-600"><Gift size={14} className="inline mr-1 -mt-0.5" />{gifts}件</span>}
                  {emotional > 0 && <span className="text-rose-600"><Activity size={14} className="inline mr-1 -mt-0.5" />{emotional}条</span>}
                  {total === 0 && <span className="text-gray-400">暂无奖励</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== Profile Tab =====================

function ProfileTab({ user, onLogout, onRefresh }: {
  user: UserType; onLogout: () => void; onRefresh: () => void;
}) {
  const [showConfirmSeed, setShowConfirmSeed] = useState(false);
  const [excelMsg, setExcelMsg] = useState('');
  const [excelUri, setExcelUri] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = async () => {
    setIsExporting(true);
    setExcelMsg('导出中…');
    setExcelUri('');
    try {
      const blob = store.exportUserDataExcel(user.id);
      const fileName = `奖励存折-${user.displayName}-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      const { path, error } = await saveAndShare(blob, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (error) {
        setExcelMsg(`保存失败: ${error}`);
      } else {
        setExcelUri(path);
        setExcelMsg(`✓ 已保存到手机下载目录\n${fileName}`);
      }
    } catch (err) {
      setExcelMsg('导出失败: ' + (err instanceof Error ? err.message : String(err)));
    }
    setIsExporting(false);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelMsg('导入中…');
    const result = await store.importUserDataFromExcel(file, user.id);
    if (result.error) {
      setExcelMsg(`导入失败: ${result.error}`);
    } else {
      setExcelMsg(`✓ 已导入 ${result.imported} 条奖励到「${result.listName}」`);
      onRefresh();
    }
    e.target.value = '';
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
        <div className="mb-4 flex justify-center"><div className={`flex items-center justify-center rounded-full text-white font-bold w-20 h-20 shadow-md ${user?.avatarColor || 'bg-blue-500'}`}><span className="text-3xl">{user?.displayName?.charAt(0) || 'U'}</span></div></div>
        <h2 className="text-xl font-bold text-gray-800">{user.displayName}</h2>
        <p className="text-sm text-gray-500 mt-1">@{user.username}</p>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-3 text-sm">我的数据</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-indigo-700">{store.getListsByOwner(user.id).length}</div>
            <div className="text-xs text-indigo-700 font-medium">创建的清单</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{store.getListsByRewarder(user.id).length}</div>
            <div className="text-xs text-emerald-600 font-medium">参与的清单</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5"><FileText size={15} className="text-indigo-500" />数据导出/导入</h3>
        {excelMsg && (
          <div className={`mb-3 p-2.5 rounded-lg text-sm whitespace-pre-line ${excelMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {excelMsg}
            {excelUri && (
              <button
                onClick={() => void shareFile(excelUri, '奖励存折数据')}
                className="mt-2 flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center"
              >
                <Share2 size={13} /> 分享文件（微信等）
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => void handleExportExcel()} disabled={isExporting}
            className="flex-1 bg-indigo-50 text-indigo-700 rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Download size={15} /> {isExporting ? '导出中…' : '导出 Excel'}
          </button>
          <button onClick={() => importRef.current?.click()}
            className="flex-1 bg-emerald-50 text-emerald-700 rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5">
            <Upload size={15} /> 导入 Excel
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
        </div>
        <p className="text-xs text-gray-400 mt-2">文件保存至手机「下载」文件夹，可分享到微信等应用</p>
      </div>

      <UpdateCheckSection />

      <button onClick={onLogout}
        className="w-full bg-red-50 text-red-600 rounded-2xl py-3 font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
        <LogOut size={18} /> 退出登录
      </button>
    </div>
  );
}

// ===================== List Detail View =====================

function ListDetailView({ listId, user, onBack, onRefresh }: {
  listId: string; user: UserType; onBack: () => void; onRefresh: () => void;
}) {
  const [modal, setModal] = useState<ModalType>(null);
  const [statusFilter, setStatusFilter] = useState<RewardStatus | 'all'>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const list = store.getListById(listId);
  if (!list) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 max-w-md mx-auto">
        <div className="text-center">
          <p className="text-gray-500 mb-2">清单不存在</p>
          <button onClick={onBack} className="text-indigo-700 font-medium">返回</button>
        </div>
      </div>
    );
  }

  const isOwner = list.ownerId === user.id;
  const isRewarder = list.rewarderIds.includes(user.id);
  const rewards = store.getRewardsByList(listId);
  const filteredRewards = statusFilter === 'all' ? rewards : rewards.filter(r => r.status === statusFilter);
  const sortedRewards = [...filteredRewards].sort((a, b) => b.createdAt - a.createdAt);
  const totalMoney = rewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
  const giftCount = rewards.filter(r => r.category === 'gift').length;
  const emotionalCount = rewards.filter(r => r.category === 'emotional').length;
  const pendingMoney = rewards.filter(r => r.category === 'money' && r.amount && r.status !== 'fulfilled').reduce((s, r) => s + (r.amount || 0), 0);

  const rewarderMap = new Map<string, Reward[]>();
  rewards.forEach(r => { const arr = rewarderMap.get(r.rewarderId) || []; arr.push(r); rewarderMap.set(r.rewarderId, arr); });

  const handleDeleteList = () => { store.deleteList(listId); onBack(); };

  return (
    <div className="h-screen flex flex-col bg-gray-50 max-w-md mx-auto">
      <div className="shrink-0 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 p-4">
          <button onClick={onBack} className="p-1 text-gray-600 hover:text-gray-800 -ml-1"><ArrowLeft size={24} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-800 truncate">{list.name}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isOwner && <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">清单主人</span>}
              {isRewarder && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">奖励人</span>}
            </div>
          </div>
          {isOwner && (
            <button onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="p-2 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"><Trash2 size={20} /></button>
          )}
        </div>
        {showDeleteConfirm && (
          <div className="px-4 pb-3 flex gap-2">
            <button onClick={handleDeleteList} className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-medium">确认删除清单</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="bg-gray-200 text-gray-600 rounded-xl py-2 px-4 text-sm font-medium">取消</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Quick stats */}
        <div className="p-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-emerald-50 rounded-xl p-3">
                <div className="text-lg font-bold text-emerald-600">¥{totalMoney >= 10000 ? `${(totalMoney / 10000).toFixed(1)}w` : totalMoney.toFixed(0)}</div>
                <div className="text-[10px] text-emerald-600 font-medium">金钱</div>
              </div>
              <div className="bg-violet-50 rounded-xl p-3">
                <div className="text-lg font-bold text-violet-600">{giftCount}</div>
                <div className="text-[10px] text-violet-600 font-medium">礼物</div>
              </div>
              <div className="bg-rose-50 rounded-xl p-3">
                <div className="text-lg font-bold text-rose-600">{emotionalCount}</div>
                <div className="text-[10px] text-rose-600 font-medium">情绪价值</div>
              </div>
            </div>
            {pendingMoney > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                <span className="text-sm text-gray-500">未兑现金额 </span>
                <span className="font-bold text-indigo-700">¥{pendingMoney.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 flex gap-2 mb-4">
          {isRewarder && (
            <button onClick={() => setModal('addReward')}
              className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-200">
              <Plus size={18} /> 添加奖励
            </button>
          )}
          {isOwner && (
            <button onClick={() => setModal('invite')}
              className="flex-1 bg-white text-emerald-600 rounded-xl py-2.5 font-medium hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 border border-emerald-200">
              <Users size={18} /> 管理奖励人
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="px-4 mb-3">
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {(['all', 'pending', 'claimed', 'fulfilled'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                {s === 'all' ? `全部 (${rewards.length})` : `${STATUS_CONFIG[s].label} (${rewards.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Rewards list */}
        <div className="px-4 space-y-2.5 mb-4">
          {sortedRewards.length === 0 ? (
            <div className="text-center py-10">
              <div className="mb-3 inline-flex p-4 bg-gray-100 text-gray-400 rounded-full"><FileText size={32} /></div>
              <p className="text-gray-400 text-sm">{statusFilter === 'all' ? '还没有奖励记录' : `没有「${STATUS_CONFIG[statusFilter].label}」的奖励`}</p>
            </div>
          ) : sortedRewards.map(reward => (
            <RewardCard key={reward.id} reward={reward} isOwner={isOwner} isRewarder={isRewarder} onRefresh={onRefresh} />
          ))}
        </div>

        {/* Summary toggle */}
        {rewards.length > 0 && (
          <div className="px-4 mb-4">
            <button onClick={() => setShowSummary(!showSummary)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">清单汇总</h3>
              {showSummary ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {showSummary && (
              <div className="mt-2 space-y-2">
                {rewarderMap.size > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">按奖励人</h4>
                    <div className="space-y-2">
                      {Array.from(rewarderMap.entries()).map(([rid, rList]) => {
                        const rUser = store.getUserById(rid);
                        const rMoney = rList.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
                        const rGifts = rList.filter(r => r.category === 'gift').length;
                        const rEmotional = rList.filter(r => r.category === 'emotional').length;
                        const rPending = rList.filter(r => r.status !== 'fulfilled').length;
                        return (
                          <div key={rid} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center justify-center rounded-full text-white font-bold w-8 h-8 ${rUser?.avatarColor || 'bg-blue-500'}`}><span className="text-xs">{rUser?.displayName?.charAt(0) || 'U'}</span></div>
                              <div>
                                <span className="text-sm font-medium text-gray-700">{rUser?.displayName}</span>
                                {rPending > 0 && <span className="text-[10px] text-indigo-700 ml-1">({rPending}待兑现)</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              {rMoney > 0 && <span className="text-emerald-600 font-medium">¥{rMoney.toFixed(0)}</span>}
                              {rGifts > 0 && <span className="text-violet-600"><Gift size={14} className="inline mr-1 -mt-0.5" />{rGifts}</span>}
                              {rEmotional > 0 && <span className="text-rose-600"><Activity size={14} className="inline mr-1 -mt-0.5" />{rEmotional}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">按状态</h4>
                  <div className="space-y-2">
                    {STATUS_FLOW.map(status => {
                      const sRewards = rewards.filter(r => r.status === status);
                      if (sRewards.length === 0) return null;
                      const sMoney = sRewards.filter(r => r.category === 'money' && r.amount).reduce((s, r) => s + (r.amount || 0), 0);
                      return (
                        <div key={status} className="flex items-center justify-between py-1.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CONFIG[status].bgColor} ${STATUS_CONFIG[status].textColor}`}>
                            {STATUS_CONFIG[status].label}
                          </span>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600">{sRewards.length}条</span>
                            {sMoney > 0 && <span className="text-emerald-600 font-medium">¥{sMoney.toFixed(0)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rewarders list */}
        {isOwner && list.rewarderIds.length > 0 && (
          <div className="px-4 mb-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-sm">奖励人 ({list.rewarderIds.length})</h3>
                <button onClick={() => setModal('invite')} className="text-xs text-indigo-700 font-medium hover:text-indigo-800">管理</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {list.rewarderIds.map(rid => {
                  const rUser = store.getUserById(rid);
                  return (
                    <div key={rid} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5">
                      <div className={`flex items-center justify-center rounded-full text-white font-bold w-6 h-6 ${rUser?.avatarColor || 'bg-blue-500'}`}><span className="text-[10px]">{rUser?.displayName?.charAt(0) || 'U'}</span></div>
                      <span className="text-sm text-gray-700">{rUser?.displayName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {list.description && (
          <div className="px-4 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 text-sm mb-1">清单说明</h3>
              <p className="text-sm text-gray-500">{list.description}</p>
            </div>
          </div>
        )}
        <div className="h-6" />
      </div>

      {modal === 'addReward' && <AddRewardModal listId={listId} onClose={() => setModal(null)} onAdded={onRefresh} />}
      {modal === 'invite' && <InviteModal listId={listId} onClose={() => setModal(null)} onInvited={onRefresh} />}
    </div>
  );
}


// ===================== Admin View =====================

function AdminView({ onLogout }: { onLogout: () => void }) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminError, setAdminError] = useState('');

  // Backup/restore state
  const [backupPassword, setBackupPassword] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupUri, setBackupUri] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMsg, setRestoreMsg] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async () => {
    setIsRefreshing(true);
    setAdminError('');
    try {
      setUsers(await store.loadAdminUsers());
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '刷新失败');
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该用户吗？相关数据可能受到影响。')) return;
    const err = await store.adminDeleteUser(id);
    if (err) setAdminError(err);
    await refresh();
  };

  const handleEdit = (u: UserType) => {
    setEditingId(u.id);
    setEditPassword('');
    setEditDisplayName(u.displayName);
  };

  const handleSave = async (id: string) => {
    const patch: { password?: string; displayName?: string } = { displayName: editDisplayName };
    if (editPassword.trim()) patch.password = editPassword.trim();
    const err = await store.adminUpdateUser(id, patch);
    if (err) setAdminError(err);
    setEditingId(null);
    setEditPassword('');
    await refresh();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) return alert('请填写完整信息');
    const err = await store.adminCreateUser(newUsername.trim(), newPassword.trim(), newDisplayName.trim());
    if (err) {
      setAdminError(err);
      return;
    }
    setNewUsername(''); setNewPassword(''); setNewDisplayName('');
    await refresh();
  };

  const handleBackup = async () => {
    if (!backupPassword.trim()) { setBackupMsg('请输入备份密码'); return; }
    setIsBackingUp(true);
    setBackupMsg('');
    setBackupUri('');
    try {
      const data = await store.exportBackup(backupPassword.trim());
      const fileName = `奖励存折备份-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.rlbk`;
      const { path, error } = await saveAndShare(data, fileName, 'application/octet-stream');
      if (error) {
        setBackupMsg(`备份失败: ${error}`);
      } else {
        setBackupUri(path);
        setBackupMsg(`✓ 已保存到手机下载目录\n${fileName}`);
        setBackupPassword('');
      }
    } catch (err) {
      setBackupMsg('备份失败: ' + (err instanceof Error ? err.message : String(err)));
    }
    setIsBackingUp(false);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!restorePassword.trim()) { setRestoreMsg('请先输入恢复密码'); e.target.value = ''; return; }
    setIsRestoring(true);
    setRestoreMsg('');
    try {
      const buf = await file.arrayBuffer();
      const err = await store.importBackup(new Uint8Array(buf), restorePassword.trim());
      if (err) {
        setRestoreMsg(err);
      } else {
        setRestoreMsg('✓ 数据已恢复，即将重新加载…');
        setRestorePassword('');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setRestoreMsg('恢复失败: ' + (err instanceof Error ? err.message : String(err)));
    }
    setIsRestoring(false);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <UserIcon className="text-indigo-600" /> 后台管理
        </h1>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={isRefreshing} className={`p-2 rounded-lg transition-all ${isRefreshing ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={onLogout} className="text-sm font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
            退出
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <h2 className="text-sm font-bold text-gray-700 mb-3">添加新用户</h2>
        {adminError && <div className="mb-3 bg-red-50 text-red-600 p-2.5 rounded-lg text-sm">{adminError}</div>}
        <form onSubmit={handleAdd} className="space-y-3">
          <input type="text" placeholder="用户名 (登录用)" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <input type="password" placeholder="初始密码" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <input type="text" placeholder="显示名称" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1"><Plus size={16} /> 添加用户</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex-1 overflow-y-auto">
        <h2 className="text-sm font-bold text-gray-700 mb-3">所有用户 ({users.length})</h2>
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="p-3 border border-gray-100 bg-gray-50 rounded-xl">
              {editingId === u.id ? (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-mono">ID: {u.id} / 用户名: {u.username} (不可改)</div>
                  <input type="password" placeholder="新密码（留空则不修改）" value={editPassword} onChange={e => setEditPassword(e.target.value)} className="w-full border border-gray-200 rounded-lg py-1.5 px-2 text-sm" />
                  <input type="text" placeholder="新显示名称" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="w-full border border-gray-200 rounded-lg py-1.5 px-2 text-sm" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => void handleSave(u.id)} className="flex-1 bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-medium">保存</button>
                    <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-200 text-gray-600 rounded-lg py-1.5 text-xs font-medium">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-gray-800">{u.displayName} <span className="text-xs text-gray-400 font-mono ml-1">@{u.username}</span></div>
                    <div className="text-xs text-gray-500 mt-0.5">密码已加密存储，可在编辑中重置</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleEdit(u)} className="p-1.5 bg-white text-indigo-600 rounded-lg shadow-sm border border-gray-200 hover:bg-indigo-50"><FileText size={14} /></button>
                    <button onClick={() => void handleDelete(u.id)} className="p-1.5 bg-white text-red-600 rounded-lg shadow-sm border border-gray-200 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Backup & Restore Section */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Shield size={15} className="text-indigo-500" />备份与恢复</h2>

        <div className="mb-4 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-2">将所有数据加密备份到文件（AES-256），保存至手机下载目录</p>
          {backupMsg && (
            <div className={`mb-2 p-2.5 rounded-lg text-xs whitespace-pre-line ${backupMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {backupMsg}
              {backupUri && (
                <button
                  onClick={() => void shareFile(backupUri, '奖励存折备份')}
                  className="mt-2 flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center"
                >
                  <Share2 size={13} /> 分享文件（微信等）
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <input type="password" placeholder="备份密码" value={backupPassword}
              onChange={e => setBackupPassword(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={() => void handleBackup()} disabled={isBackingUp}
              className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              <Download size={14} />{isBackingUp ? '加密中…' : '备份'}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">从备份文件恢复（将覆盖当前所有数据）</p>
          {restoreMsg && (
            <div className={`mb-2 p-2 rounded-lg text-xs ${restoreMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{restoreMsg}</div>
          )}
          <div className="flex gap-2">
            <input type="password" placeholder="备份密码" value={restorePassword}
              onChange={e => setRestorePassword(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={() => restoreFileRef.current?.click()} disabled={isRestoring}
              className="bg-amber-500 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5">
              <Upload size={14} />{isRestoring ? '恢复中…' : '恢复'}
            </button>
            <input ref={restoreFileRef} type="file" accept=".rlbk" className="hidden" onChange={handleRestoreFile} />
          </div>
        </div>
      </div>

      <UpdateCheckSection />
    </div>
  );
}

// ===================== Main App =====================


export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    store.initStore().then(() => {
      const stored = store.getCurrentUser();
      if (stored) { setUser(stored); setView('main'); }
      setIsReady(true);
      setRefreshKey(k => k + 1);
    });
  }, []);
  const [view, setView] = useState<View>('auth');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [tab, setTab] = useState<Tab>('myLists');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);



  const handleLogin = (u: UserType) => { store.setCurrentUser(u); setUser(u); setView('main'); };
  const handleLogout = () => { store.setCurrentUser(null); setUser(null); setView('auth'); setAuthMode('login'); setTab('myLists'); setSelectedListId(null); };
  const handleOpenList = (listId: string) => { setSelectedListId(listId); setView('listDetail'); };
  const handleBackFromList = () => { setView('main'); setSelectedListId(null); refresh(); };

  if (view === 'auth' || !user) {
    if (authMode === 'register') return <RegisterView onRegister={handleLogin} onGoLogin={() => setAuthMode('login')} />;
    return <LoginView onLogin={handleLogin} onGoRegister={() => setAuthMode('register')} />;
  }

  if (user.username === 'admin') {
    return <AdminView onLogout={handleLogout} />;
  }

  if (view === 'listDetail' && selectedListId) {
    return <ListDetailView listId={selectedListId} user={user} onBack={handleBackFromList} onRefresh={refresh} />;
  }

  const pendingCount = store.getPendingInvitations(user.id).length;

  const tabItems: Array<{ key: Tab; icon: typeof ListOrdered; label: string; badge: number }> = [
    { key: 'myLists', icon: ListOrdered, label: '我的清单', badge: 0 },
    { key: 'asRewarder', icon: Gift, label: '奖励人', badge: pendingCount },
    { key: 'summary', icon: BarChart3, label: '汇总', badge: 0 },
    { key: 'profile', icon: UserIcon, label: '我的', badge: 0 },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 max-w-md mx-auto relative">
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-indigo-600" />
            <h1 className="text-lg font-bold text-gray-800">奖励存折</h1>
          </div>
          <button onClick={() => { setTab('profile'); refresh(); }}
            className="flex items-center gap-1.5 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors">
            <div className={`flex items-center justify-center rounded-full text-white font-bold w-6 h-6 ${user?.avatarColor || 'bg-blue-500'}`}><span className="text-[10px]">{user?.displayName?.charAt(0) || 'U'}</span></div>
            <span className="text-sm font-medium text-gray-600 max-w-[80px] truncate">{user.displayName}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {tab === 'myLists' && <MyListsTab onOpenList={handleOpenList} onCreateList={() => setModal('createList')} />}
        {tab === 'asRewarder' && <AsRewarderTab onOpenList={handleOpenList} onRefresh={refresh} />}
        {tab === 'summary' && <SummaryTab />}
        {tab === 'profile' && <ProfileTab user={user} onLogout={handleLogout} onRefresh={refresh} />}
      </div>

      <nav className="shrink-0 bg-white border-t border-gray-200">
        <div className="flex">
          {tabItems.map(({ key, icon: Icon, label, badge }) => (
            <button key={key} onClick={() => { setTab(key); refresh(); }}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors relative ${tab === key ? 'text-indigo-700' : 'text-gray-400'}`}>
              <div className="relative">
                <Icon size={22} strokeWidth={tab === key ? 2.5 : 1.5} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
              {tab === key && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />}
            </button>
          ))}
        </div>
      </nav>

      {modal === 'createList' && <CreateListModal onClose={() => setModal(null)} onCreated={refresh} />}
    </div>
  );
}
