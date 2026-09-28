export class UpsertCategoryDto {
  name: string;
  icon: string;
  color: string;
  type?: string;
  description?: string | null;
  isFixed?: boolean;
  wantNeed?: 'want' | 'need' | null;
}

/** The fields a client may set; id, userId and isDefault are server-owned. */
export const CATEGORY_FIELDS = ['name', 'icon', 'color', 'type', 'description', 'isFixed', 'wantNeed'] as const satisfies readonly (keyof UpsertCategoryDto)[];
