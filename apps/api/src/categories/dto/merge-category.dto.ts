/** POST /categories/:id/merge — fold category :id into `targetId`. */
export class MergeCategoryDto {
  targetId: string;
  /** Optional new name for the surviving (target) category. Blank keeps the target's name. */
  name?: string | null;
}
