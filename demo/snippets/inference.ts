import { v, type Infer, type Input } from 'valiq-js';

export const Settings = v.object({
  theme: v.enum(['light', 'dark']).default('light'),
  fontSize: v.number().int().min(8).optional(),
  tags: v.array(v.string()).max(5),
});

export type Settings = Infer<typeof Settings>;
// { theme: 'light' | 'dark'; tags: string[]; fontSize?: number | undefined }

export type SettingsInput = Input<typeof Settings>;
// { tags: string[]; theme?: 'light' | 'dark' | undefined; fontSize?: number | undefined }
