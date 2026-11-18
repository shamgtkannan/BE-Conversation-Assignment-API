// Integration tests that start the whole app need to know where Kafka is. Set before the
// app reads its config; an explicit KAFKA_BROKERS in the environment still wins.
process.env.KAFKA_BROKERS ??= process.env.KAFKA_TEST_BROKERS ?? 'localhost:9092';
