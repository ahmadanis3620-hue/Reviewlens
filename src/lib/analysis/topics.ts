import { prisma } from "@/lib/db";
import { STARTER_TOPICS, labelForTopicKey } from "@/lib/topics/catalog";

/**
 * Topic dictionary management.
 *
 * Businesses start with the cross-vertical catalog so naming is consistent,
 * but the dictionary is open: a key the analyzer invents is added on first
 * sight rather than discarded. That is the whole point of not hard-coding
 * topics per vertical.
 */

export async function seedStarterTopics(businessId: string): Promise<void> {
  await prisma.reviewTopic.createMany({
    data: STARTER_TOPICS.map((topic) => ({
      businessId,
      key: topic.key,
      label: topic.label,
      description: topic.description,
      isCustom: false,
    })),
    skipDuplicates: true,
  });
}

/**
 * Resolves topic keys to row ids, creating any that are new to this business.
 * Returns a lookup the caller uses when writing mentions.
 */
export async function ensureTopics(
  businessId: string,
  topics: Array<{ key: string; label?: string }>,
): Promise<Map<string, string>> {
  if (topics.length === 0) return new Map();

  const keys = [...new Set(topics.map((t) => t.key))];

  const existing = await prisma.reviewTopic.findMany({
    where: { businessId, key: { in: keys } },
    select: { id: true, key: true },
  });

  const lookup = new Map(existing.map((t) => [t.key, t.id]));
  const missing = keys.filter((key) => !lookup.has(key));

  if (missing.length > 0) {
    const starterKeys = new Set(STARTER_TOPICS.map((t) => t.key));
    await prisma.reviewTopic.createMany({
      data: missing.map((key) => ({
        businessId,
        key,
        label: topics.find((t) => t.key === key)?.label ?? labelForTopicKey(key),
        isCustom: !starterKeys.has(key),
      })),
      skipDuplicates: true,
    });

    const created = await prisma.reviewTopic.findMany({
      where: { businessId, key: { in: missing } },
      select: { id: true, key: true },
    });
    for (const topic of created) lookup.set(topic.key, topic.id);
  }

  return lookup;
}
