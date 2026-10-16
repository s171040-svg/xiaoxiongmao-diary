export type Category = 'leisure' | 'idea' | 'worry';

export type JournalEntry = {
  id: string;
  text: string;
  category: Category;
  goal: boolean;
  photo?: string;
  reply?: string;
  createdAt: number;
};
