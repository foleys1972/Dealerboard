const logger = require('../utils/logger');
const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.client = null;
    this.cluster = null;
    this.isConnected = false;
    this.isCluster = false;
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      enabled: process.env.REDIS_ENABLED !== 'false',
      cluster: process.env.REDIS_CLUSTER_ENABLED === 'true',
      clusterNodes: process.env.REDIS_CLUSTER_NODES ? 
        process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host: host.trim(), port: parseInt(port) || 6379 };
        }) : [
          { host: 'localhost', port: 6379 },
          { host: 'localhost', port: 6380 },
          { host: 'localhost', port: 6381 }
        ],
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Redis is disabled');
      return null;
    }

    try {
      if (this.config.cluster) {
        await this.initializeCluster();
      } else {
        await this.initializeSingle();
      }

      this.isConnected = true;
      logger.info('Redis service initialized successfully', {
        mode: this.isCluster ? 'cluster' : 'single',
        nodes: this.isCluster ? this.config.clusterNodes.length : 1
      });

      return this;
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  async initializeCluster() {
    try {
      this.cluster = new Redis.Cluster(this.config.clusterNodes, {
        redisOptions: {
          password: this.config.password,
          db: this.config.db,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryDelayOnFailover: this.config.retryDelayOnFailover,
          enableReadyCheck: this.config.enableReadyCheck,
          lazyConnect: this.config.lazyConnect,
          keepAlive: this.config.keepAlive,
          connectTimeout: this.config.connectTimeout,
          commandTimeout: this.config.commandTimeout,
        },
        enableOfflineQueue: false,
        maxRedirections: 16,
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 300,
        maxRetriesPerRequest: 3,
        scaleReads: 'slave',
        enableReadyCheck: true,
        redisOptions: {
          password: this.config.password,
        },
      });

      this.client = this.cluster;
      this.isCluster = true;

      // Set up event handlers
      this.setupClusterEventHandlers();

      await this.cluster.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis cluster:', error);
      throw error;
    }
  }

  async initializeSingle() {
    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        retryDelayOnFailover: this.config.retryDelayOnFailover,
        enableReadyCheck: this.config.enableReadyCheck,
        lazyConnect: this.config.lazyConnect,
        keepAlive: this.config.keepAlive,
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
      });

      this.isCluster = false;

      // Set up event handlers
      this.setupSingleEventHandlers();

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis single instance:', error);
      throw error;
    }
  }

  setupClusterEventHandlers() {
    this.cluster.on('connect', () => {
      logger.info('Redis cluster connected');
    });

    this.cluster.on('ready', () => {
      logger.info('Redis cluster ready');
      this.isConnected = true;
    });

    this.cluster.on('error', (error) => {
      logger.error('Redis cluster error:', error);
      this.isConnected = false;
    });

    this.cluster.on('close', () => {
      logger.warn('Redis cluster connection closed');
      this.isConnected = false;
    });

    this.cluster.on('reconnecting', () => {
      logger.info('Redis cluster reconnecting...');
    });

    this.cluster.on('+node', (node) => {
      logger.info('Redis cluster node added:', node.options.host + ':' + node.options.port);
    });

    this.cluster.on('-node', (node) => {
      logger.warn('Redis cluster node removed:', node.options.host + ':' + node.options.port);
    });

    this.cluster.on('node error', (error, node) => {
      logger.error('Redis cluster node error:', error.message, node.options.host + ':' + node.options.port);
    });
  }

  setupSingleEventHandlers() {
    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async get(key) {
    if (!this.client || !this.isConnected) {
      return null;
    }
    try {
      const result = await this.client.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async expire(key, seconds) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  }

  async hget(hash, field) {
    if (!this.client || !this.isConnected) {
      return null;
    }
    try {
      const result = await this.client.hget(hash, field);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      logger.error('Redis HGET error:', error);
      return null;
    }
  }

  async hset(hash, field, value) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedValue = JSON.stringify(value);
      await this.client.hset(hash, field, serializedValue);
      return true;
    } catch (error) {
      logger.error('Redis HSET error:', error);
      return false;
    }
  }

  async hdel(hash, field) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.hdel(hash, field);
      return result > 0;
    } catch (error) {
      logger.error('Redis HDEL error:', error);
      return false;
    }
  }

  async hgetall(hash) {
    if (!this.client || !this.isConnected) {
      return {};
    }
    try {
      const result = await this.client.hgetall(hash);
      const parsed = {};
      for (const [key, value] of Object.entries(result)) {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = value;
        }
      }
      return parsed;
    } catch (error) {
      logger.error('Redis HGETALL error:', error);
      return {};
    }
  }

  async sadd(key, ...members) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedMembers = members.map(member => JSON.stringify(member));
      const result = await this.client.sadd(key, ...serializedMembers);
      return result > 0;
    } catch (error) {
      logger.error('Redis SADD error:', error);
      return false;
    }
  }

  async srem(key, ...members) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedMembers = members.map(member => JSON.stringify(member));
      const result = await this.client.srem(key, ...serializedMembers);
      return result > 0;
    } catch (error) {
      logger.error('Redis SREM error:', error);
      return false;
    }
  }

  async smembers(key) {
    if (!this.client || !this.isConnected) {
      return [];
    }
    try {
      const result = await this.client.smembers(key);
      return result.map(member => {
        try {
          return JSON.parse(member);
        } catch {
          return member;
        }
      });
    } catch (error) {
      logger.error('Redis SMEMBERS error:', error);
      return [];
    }
  }

  async sismember(key, member) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedMember = JSON.stringify(member);
      const result = await this.client.sismember(key, serializedMember);
      return result === 1;
    } catch (error) {
      logger.error('Redis SISMEMBER error:', error);
      return false;
    }
  }

  async publish(channel, message) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const serializedMessage = JSON.stringify(message);
      const result = await this.client.publish(channel, serializedMessage);
      return result > 0;
    } catch (error) {
      logger.error('Redis PUBLISH error:', error);
      return false;
    }
  }

  async subscribe(channel, callback) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      await this.client.subscribe(channel);
      this.client.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch {
            callback(message);
          }
        }
      });
      return true;
    } catch (error) {
      logger.error('Redis SUBSCRIBE error:', error);
      return false;
    }
  }

  async unsubscribe(channel) {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      await this.client.unsubscribe(channel);
      return true;
    } catch (error) {
      logger.error('Redis UNSUBSCRIBE error:', error);
      return false;
    }
  }

  // Session management methods
  async setSession(sessionId, sessionData, ttl = 3600) {
    const key = `session:${sessionId}`;
    return await this.set(key, sessionData, ttl);
  }

  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.del(key);
  }

  async extendSession(sessionId, ttl = 3600) {
    const key = `session:${sessionId}`;
    return await this.expire(key, ttl);
  }

  // User session tracking
  async addUserSession(userId, sessionId) {
    const key = `user_sessions:${userId}`;
    return await this.sadd(key, sessionId);
  }

  async removeUserSession(userId, sessionId) {
    const key = `user_sessions:${userId}`;
    return await this.srem(key, sessionId);
  }

  async getUserSessions(userId) {
    const key = `user_sessions:${userId}`;
    return await this.smembers(key);
  }

  // Group state management
  async setGroupState(groupId, state) {
    const key = `group_state:${groupId}`;
    return await this.set(key, state, 1800); // 30 minutes TTL
  }

  async getGroupState(groupId) {
    const key = `group_state:${groupId}`;
    return await this.get(key);
  }

  async deleteGroupState(groupId) {
    const key = `group_state:${groupId}`;
    return await this.del(key);
  }

  // Connection tracking
  async addConnection(connectionId, connectionData) {
    const key = `connection:${connectionId}`;
    return await this.set(key, connectionData, 300); // 5 minutes TTL
  }

  async getConnection(connectionId) {
    const key = `connection:${connectionId}`;
    return await this.get(key);
  }

  async removeConnection(connectionId) {
    const key = `connection:${connectionId}`;
    return await this.del(key);
  }

  // Rate limiting
  async incrementRateLimit(key, window = 60) {
    if (!this.client || !this.isConnected) {
      return 0;
    }
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const current = await this.client.incr(rateLimitKey);
      if (current === 1) {
        await this.client.expire(rateLimitKey, window);
      }
      return current;
    } catch (error) {
      logger.error('Redis rate limit error:', error);
      return 0;
    }
  }

  async getRateLimit(key) {
    if (!this.client || !this.isConnected) {
      return 0;
    }
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const result = await this.client.get(rateLimitKey);
      return result ? parseInt(result) : 0;
    } catch (error) {
      logger.error('Redis get rate limit error:', error);
      return 0;
    }
  }

  // Cache management
  async setCache(key, value, ttl = 300) {
    const cacheKey = `cache:${key}`;
    return await this.set(cacheKey, value, ttl);
  }

  async getCache(key) {
    const cacheKey = `cache:${key}`;
    return await this.get(cacheKey);
  }

  async deleteCache(key) {
    const cacheKey = `cache:${key}`;
    return await this.del(cacheKey);
  }

  // Health check
  async ping() {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis PING error:', error);
      return false;
    }
  }

  // Get cluster info
  async getClusterInfo() {
    if (!this.isCluster || !this.cluster) {
      return null;
    }
    try {
      const nodes = this.cluster.nodes();
      return {
        nodes: nodes.map(node => ({
          host: node.options.host,
          port: node.options.port,
          status: node.status,
          role: node.role
        })),
        slots: this.cluster.slots,
        state: this.cluster.status
      };
    } catch (error) {
      logger.error('Redis cluster info error:', error);
      return null;
    }
  }

  async quit() {
    this.isConnected = false;
    if (this.client) {
      await this.client.quit();
    }
    logger.info('Redis client disconnected');
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isCluster: this.isCluster,
      config: {
        enabled: this.config.enabled,
        cluster: this.config.cluster,
        host: this.config.host,
        port: this.config.port,
        nodes: this.isCluster ? this.config.clusterNodes.length : 1
      },
    };
  }
}

async function initializeRedis() {
  try {
    const redisService = new RedisService();
    await redisService.initialize();
    logger.info('Redis service initialized');
    return redisService;
  } catch (error) {
    logger.error('Failed to initialize Redis service:', error);
    throw error;
  }
}

module.exports = {
  initializeRedis,
  RedisService,
};
