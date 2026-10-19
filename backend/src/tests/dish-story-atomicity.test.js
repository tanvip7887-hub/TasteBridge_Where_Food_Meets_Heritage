import assert from "node:assert/strict";
import test from "node:test";
import { persistDishAndStoryUpdate } from "../modules/cook/cook.service.js";

const initialState = () => ({
  dish: { id: "dish-1", name: "Idli", status: "DRAFT", price: 8, cuisine: "South Indian", categoryId: "category-1" },
  story: { id: "story-1", dishId: "dish-1", whoTaught: "Mother", storyText: "A traditional recipe story", visibility: "PUBLIC" },
});

const transactionalDatabase = (state, { failDishUpdate = false } = {}) => {
  let transactions = 0;
  const database = {
    async $transaction(callback) {
      transactions += 1;
      const working = structuredClone(state);
      const tx = {
        dishStory: {
          async update({ data }) {
            Object.assign(working.story, data);
            return working.story;
          },
          async create({ data }) {
            working.story = { id: "story-created", ...data };
            return working.story;
          },
        },
        dish: {
          async updateMany({ where, data }) {
            if (working.dish.id !== where.id || working.dish.status !== where.status) return { count: 0 };
            Object.assign(working.dish, data);
            return { count: 1 };
          },
          async findUnique({ include }) {
            return {
              ...working.dish,
              ...(include?.story ? { story: working.story } : {}),
            };
          },
          async update({ data, include }) {
            if (failDishUpdate) throw new Error("simulated dish write failure");
            Object.assign(working.dish, data);
            return {
              ...working.dish,
              ...(include?.story ? { story: working.story } : {}),
            };
          },
        },
      };

      const result = await callback(tx);
      state.dish = working.dish;
      state.story = working.story;
      return result;
    },
    get transactions() {
      return transactions;
    },
  };
  return database;
};

test("dish and existing story updates commit together", async () => {
  const state = initialState();
  const database = transactionalDatabase(state);

  const result = await persistDishAndStoryUpdate(database, {
    dishId: "dish-1",
    updates: { name: "Steamed Idli" },
    storyWrite: {
      type: "update",
      id: "story-1",
      data: { storyText: "A revised traditional recipe story" },
    },
  });

  assert.equal(database.transactions, 1);
  assert.equal(state.dish.name, "Steamed Idli");
  assert.equal(state.story.storyText, "A revised traditional recipe story");
  assert.equal(result.story, state.story);
});

test("dish write failure rolls back the preceding story update", async () => {
  const state = initialState();
  const before = structuredClone(state);
  const database = transactionalDatabase(state, { failDishUpdate: true });

  await assert.rejects(
    persistDishAndStoryUpdate(database, {
      dishId: "dish-1",
      updates: { name: "Steamed Idli" },
      storyWrite: {
        type: "update",
        id: "story-1",
        data: { storyText: "A revised traditional recipe story" },
      },
    }),
    /simulated dish write failure/
  );

  assert.deepEqual(state, before);
});

test("Cook edits use a status-guarded write so a concurrent Admin decision cannot be overwritten", async () => {
  const state = initialState();
  state.dish.status = "PENDING_APPROVAL";
  const database = transactionalDatabase(state);
  const updated = await persistDishAndStoryUpdate(database, {
    dishId: "dish-1",
    expectedStatus: "PENDING_APPROVAL",
    updates: { name: "Updated Idli" },
    storyWrite: null,
  });
  assert.equal(updated.name, "Updated Idli");
  assert.equal(state.dish.status, "PENDING_APPROVAL");

  const staleState = initialState();
  staleState.dish.status = "PUBLISHED";
  const staleDatabase = transactionalDatabase(staleState);
  await assert.rejects(
    persistDishAndStoryUpdate(staleDatabase, {
      dishId: "dish-1", expectedStatus: "PENDING_APPROVAL", updates: { name: "Unreviewed edit" }, storyWrite: null,
    }),
    /status changed while you were editing/
  );
  assert.equal(staleState.dish.name, "Idli");
  assert.equal(staleState.dish.status, "PUBLISHED");
});

