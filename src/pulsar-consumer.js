const uuid = require('uuid');

// export interface ConsumerConfig {
//     topic?: string;
//     topics?: string[];
//     topicsPattern?: string;
//     subscription: string;
//     subscriptionType?: SubscriptionType;
//     subscriptionInitialPosition?: InitialPosition;
//     ackTimeoutMs?: number;
//     nAckRedeliverTimeoutMs?: number;
//     receiverQueueSize?: number;
//     receiverQueueSizeAcrossPartitions?: number;
//     consumerName?: string;
//     properties?: { [key: string]: string };
//     readCompacted?: boolean;
//     privateKeyPath?: string;
//     cryptoFailureAction?: ConsumerCryptoFailureAction;
//     maxPendingChunkedMessage?: number;
//     autoAckOldestChunkedMessageOnQueueFull?: number;
//     batchIndexAckEnabled?: boolean;
//     regexSubscriptionMode?: RegexSubscriptionMode;
//     deadLetterPolicy?: DeadLetterPolicy;
// }

function propertiesToConsumerConfig(properties, RED, node) {
    const result = {};
    if (properties.topic) {
        result.topic = RED.util.evaluateNodeProperty(properties.topic, "str", node);
    }
    if (properties.topics) {
        result.topics = RED.util.evaluateNodeProperty(properties.topics, "str", node);
    }
    if (properties.topicsPattern) {
        result.topicsPattern = RED.util.evaluateNodeProperty(properties.topicsPattern, "str", node);
    }

    result.subscription = RED.util.evaluateNodeProperty(properties.subscription, "str", node) || 'consumer-'+uuid.v4();

    if (properties.subscriptionType) {
        result.subscriptionType = RED.util.evaluateNodeProperty(properties.subscriptionType, "str", node);
    }
    if (properties.subscriptionInitialPosition) {
        result.subscriptionInitialPosition = RED.util.evaluateNodeProperty(properties.subscriptionInitialPosition, "str", node);
    }
    if (properties.ackTimeoutMs) {
        result.ackTimeoutMs = RED.util.evaluateNodeProperty(properties.ackTimeoutMs, "num", node);
    }
    if (properties.nAckRedeliverTimeoutMs) {
        result.nAckRedeliverTimeoutMs = RED.util.evaluateNodeProperty(properties.nAckRedeliverTimeoutMs, "num", node);
    }
    if (properties.receiverQueueSize) {
        result.receiverQueueSize = RED.util.evaluateNodeProperty(properties.receiverQueueSize, "num", node);
    }
    if (properties.receiverQueueSizeAcrossPartitions) {
        result.receiverQueueSizeAcrossPartitions = RED.util.evaluateNodeProperty(properties.receiverQueueSizeAcrossPartitions, "num", node);
    }

    result.consumerName = RED.util.evaluateNodeProperty(properties.consumerName, "str", node) || 'consumer-'+uuid.v4();

    if (properties.properties) {
        result.properties = RED.util.evaluateNodeProperty(properties.properties, "json", node);
    }
    if (properties.readCompacted) {
        result.readCompacted = RED.util.evaluateNodeProperty(properties.readCompacted, "bool", node);
    }
    if (properties.privateKeyPath) {
        result.privateKeyPath = RED.util.evaluateNodeProperty(properties.privateKeyPath, "str", node);
    }
    if (properties.cryptoFailureAction) {
        result.cryptoFailureAction = RED.util.evaluateNodeProperty(properties.cryptoFailureAction, "str", node);
    }
    if (properties.maxPendingChunkedMessage) {
        result.maxPendingChunkedMessage = RED.util.evaluateNodeProperty(properties.maxPendingChunkedMessage, "num", node);
    }
    if (properties.autoAckOldestChunkedMessageOnQueueFull) {
        result.autoAckOldestChunkedMessageOnQueueFull = RED.util.evaluateNodeProperty(properties.autoAckOldestChunkedMessageOnQueueFull, "num", node);
    }
    if (properties.batchIndexAckEnabled) {
        result.batchIndexAckEnabled = RED.util.evaluateNodeProperty(properties.batchIndexAckEnabled, "bool", node);
    }
    if (properties.regexSubscriptionMode) {
        result.regexSubscriptionMode = RED.util.evaluateNodeProperty(properties.regexSubscriptionMode, "str", node);
    }
    if (properties.deadLetterPolicy) {
        result.deadLetterPolicy = RED.util.evaluateNodeProperty(properties.deadLetterPolicy, "str", node);
    }
    return result;
}

module.exports = function(RED) {
    function PulsarConsumer(properties) {
        RED.nodes.createNode(this, properties);
        const node = this;
        const producerConfig = propertiesToConsumerConfig(properties, RED, node);
        const schemaConfig = RED.nodes.getNode(properties.schema);
        if(schemaConfig && schemaConfig.schemaInfo) {
            producerConfig.schema = schemaConfig.schemaInfo;
        }

        producerConfig.listener = function (pulsarMessage, msgConsumer) {
            node.debug('Message received');
            //if the buffer is empty, the message is not a json object
            const str = pulsarMessage.getData().toString();
            try {
                const data = JSON.parse(str);
                const msg = {
                    topic: node.topic,
                    payload: data
                };
                node.send([msg, null]);
            } catch (e) {
                node.debug('Message is not a json object');
                const msg = {
                    topic: node.topic,
                    payload: str
                };
                node.send([msg, null]);
            }
            msgConsumer.acknowledge(pulsarMessage).then(r => {
                node.debug('Message acknowledged'+r);
            }).catch(e => {
                node.error('Error acknowledging message: ' + e);
                node.status({fill: "red", shape: "dot", text: "Ack error"});
            });
        }

        node.producerConfig = producerConfig;

        node.on('close', async function() {
            node.consumer && await node.consumer.close();
        });
        node.status({fill: "red", shape: "dot", text: "disconnected"});

        const pulsarClient = RED.nodes.getNode(properties.config).client;
        if(!pulsarClient) {
            node.error('Client not created');
            node.status({fill: "red", shape: "dot", text: "Client not created"});
            return;
        }
        node.status({fill: "yellow", shape: "dot", text: "connecting"});

        pulsarClient.subscribe(node.producerConfig)
            .then(consumer => {
            node.consumer = consumer;
            node.debug('Consumer created');
            node.status({fill: "green", shape: "dot", text: "connected"});
            const message = {
                topic: 'pulsar',
                payload: {
                    type: 'consumer',
                    status: 'ready',
                    topic: node.producerConfig.topic,
                    subscription: node.producerConfig.subscription,
                    subscriptionType: node.producerConfig.subscriptionType,
                }
            };
            node.send([null, message]);

        }).catch(e => {
            node.error('Error creating consumer: ' + e);
            node.status({fill: "red", shape: "dot", text: "Connection error"});
        });

    }
    RED.nodes.registerType("pulsar-consumer",PulsarConsumer);
}