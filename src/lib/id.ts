/** Short, collision-resistant id with a readable prefix. */
export const newId = (prefix = 'id'): string =>
  `${prefix}_${crypto.randomUUID().slice(0, 8)}`
