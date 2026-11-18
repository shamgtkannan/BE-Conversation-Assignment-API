/** The part of kafkajs' `Admin` that creating topics needs. */
export interface KafkaTopicAdmin {
  connect(): Promise<void>;
  createTopics(request: {
    topics: { topic: string; numPartitions: number; replicationFactor: number }[];
    waitForLeaders: boolean;
  }): Promise<boolean>;
  disconnect(): Promise<void>;
}

/** Partitions per event topic. Events of one conversation share a key, so they stay in one. */
export const EVENT_TOPIC_PARTITIONS = 3;

/**
 * Creates the topics that do not exist yet (existing ones are left alone), so a
 * fresh checkout works without a setup step. One replica, because the local
 * broker is a single node. Kafka answers `false` instead of failing for a topic
 * that exists, so this is safe to run on every start.
 */
export async function ensureTopics(admin: KafkaTopicAdmin, topics: string[]): Promise<void> {
  await admin.connect();
  try {
    await admin.createTopics({
      topics: topics.map((topic) => ({
        topic,
        numPartitions: EVENT_TOPIC_PARTITIONS,
        replicationFactor: 1,
      })),
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
}
