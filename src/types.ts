export type RewardCategory = 'money' | 'gift' | 'emotional';
export type RewardStatus = 'pending' | 'claimed' | 'fulfilled';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

export interface RewardList {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  rewarderIds: string[];
  createdAt: number;
}

export interface Reward {
  id: string;
  listId: string;
  rewarderId: string;
  category: RewardCategory;
  title: string;
  description: string;
  amount?: number;
  status: RewardStatus;
  createdAt: number;
}

export interface Invitation {
  id: string;
  listId: string;
  listName: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}
