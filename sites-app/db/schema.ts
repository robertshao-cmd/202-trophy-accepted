import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const detectiveRooms = sqliteTable("detective_rooms", {
  code: text("code").primaryKey().notNull(),
  version: integer("version").notNull().default(0),
  roomJson: text("room_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  index("idx_detective_rooms_expires_at").on(table.expiresAt),
]);
