const ldap = require('ldapjs');
const logger = require('../utils/logger');
const { groupService } = require('./groupService');

class ActiveDirectoryService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = {
      url: process.env.AD_URL || 'ldap://localhost:389',
      baseDN: process.env.AD_BASE_DN || 'dc=example,dc=com',
      bindDN: process.env.AD_BIND_DN || 'cn=admin,dc=example,dc=com',
      bindPassword: process.env.AD_BIND_PASSWORD || 'password',
      userSearchBase: process.env.AD_USER_SEARCH_BASE || 'ou=users,dc=example,dc=com',
      groupSearchBase: process.env.AD_GROUP_SEARCH_BASE || 'ou=groups,dc=example,dc=com',
      enabled: process.env.AD_ENABLED === 'true',
      syncInterval: parseInt(process.env.AD_SYNC_INTERVAL) || 300000, // 5 minutes
      userAttributes: [
        'cn', 'sn', 'givenName', 'mail', 'telephoneNumber', 
        'title', 'department', 'manager', 'memberOf', 'userPrincipalName',
        'sAMAccountName', 'displayName', 'objectGUID', 'whenCreated', 'whenChanged'
      ],
      groupAttributes: [
        'cn', 'description', 'member', 'memberOf', 'objectGUID',
        'whenCreated', 'whenChanged', 'groupType'
      ]
    };
    this.syncTimer = null;
    this.userCache = new Map();
    this.groupCache = new Map();
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Active Directory integration is disabled');
      return null;
    }

    try {
      logger.info('Initializing Active Directory connection...');
      
      this.client = ldap.createClient({
        url: this.config.url,
        timeout: 10000,
        connectTimeout: 10000,
        reconnect: true
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Bind to AD
      await this.bind();

      // Start periodic sync
      this.startPeriodicSync();

      this.isConnected = true;
      logger.info('Active Directory connection established');
      
      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Active Directory connection:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.client) return;

    this.client.on('error', (error) => {
      logger.error('Active Directory client error:', error);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Active Directory client connected');
      this.isConnected = true;
    });

    this.client.on('connectTimeout', () => {
      logger.warn('Active Directory connection timeout');
      this.isConnected = false;
    });

    this.client.on('connectError', (error) => {
      logger.error('Active Directory connection error:', error);
      this.isConnected = false;
    });
  }

  async bind() {
    return new Promise((resolve, reject) => {
      this.client.bind(this.config.bindDN, this.config.bindPassword, (error) => {
        if (error) {
          logger.error('Active Directory bind failed:', error);
          reject(error);
        } else {
          logger.info('Active Directory bind successful');
          resolve();
        }
      });
    });
  }

  // Authenticate user against AD
  async authenticateUser(username, password) {
    if (!this.isConnected) {
      throw new Error('Active Directory not connected');
    }

    try {
      const userDN = await this.findUserDN(username);
      if (!userDN) {
        throw new Error('User not found in Active Directory');
      }

      // Create a new client for authentication
      const authClient = ldap.createClient({ url: this.config.url });
      
      return new Promise((resolve, reject) => {
        authClient.bind(userDN, password, (error) => {
          authClient.unbind();
          
          if (error) {
            logger.warn(`Authentication failed for user ${username}:`, error.message);
            reject(new Error('Invalid credentials'));
          } else {
            logger.info(`User ${username} authenticated successfully`);
            resolve({
              username,
              userDN,
              authenticated: true
            });
          }
        });
      });
    } catch (error) {
      logger.error('Authentication error:', error);
      throw error;
    }
  }

  // Find user DN by username
  async findUserDN(username) {
    try {
      const searchOptions = {
        scope: 'sub',
        filter: `(|(sAMAccountName=${username})(userPrincipalName=${username})(cn=${username}))`,
        attributes: ['dn']
      };

      return new Promise((resolve, reject) => {
        this.client.search(this.config.userSearchBase, searchOptions, (error, res) => {
          if (error) {
            reject(error);
            return;
          }

          let userDN = null;
          res.on('searchEntry', (entry) => {
            userDN = entry.dn.toString();
          });

          res.on('error', (error) => {
            reject(error);
          });

          res.on('end', () => {
            resolve(userDN);
          });
        });
      });
    } catch (error) {
      logger.error('Failed to find user DN:', error);
      throw error;
    }
  }

  // Get user details from AD
  async getUserDetails(username) {
    try {
      const searchOptions = {
        scope: 'sub',
        filter: `(|(sAMAccountName=${username})(userPrincipalName=${username})(cn=${username}))`,
        attributes: this.config.userAttributes
      };

      return new Promise((resolve, reject) => {
        this.client.search(this.config.userSearchBase, searchOptions, (error, res) => {
          if (error) {
            reject(error);
            return;
          }

          let userDetails = null;
          res.on('searchEntry', (entry) => {
            userDetails = this.parseUserEntry(entry);
          });

          res.on('error', (error) => {
            reject(error);
          });

          res.on('end', () => {
            resolve(userDetails);
          });
        });
      });
    } catch (error) {
      logger.error('Failed to get user details:', error);
      throw error;
    }
  }

  // Parse user entry from AD
  parseUserEntry(entry) {
    const attributes = entry.attributes;
    const user = {};

    attributes.forEach(attr => {
      const name = attr.type;
      const values = attr.values;

      if (values && values.length > 0) {
        user[name] = values.length === 1 ? values[0] : values;
      }
    });

    return {
      dn: entry.dn.toString(),
      username: user.sAMAccountName || user.userPrincipalName,
      email: user.mail,
      firstName: user.givenName,
      lastName: user.sn,
      displayName: user.displayName || user.cn,
      title: user.title,
      department: user.department,
      phone: user.telephoneNumber,
      manager: user.manager,
      groups: user.memberOf || [],
      guid: user.objectGUID,
      created: user.whenCreated,
      modified: user.whenChanged
    };
  }

  // Get user groups from AD
  async getUserGroups(username) {
    try {
      const userDetails = await this.getUserDetails(username);
      if (!userDetails || !userDetails.groups) {
        return [];
      }

      const groups = [];
      for (const groupDN of userDetails.groups) {
        const groupDetails = await this.getGroupDetails(groupDN);
        if (groupDetails) {
          groups.push(groupDetails);
        }
      }

      return groups;
    } catch (error) {
      logger.error('Failed to get user groups:', error);
      throw error;
    }
  }

  // Get group details from AD
  async getGroupDetails(groupDN) {
    try {
      const searchOptions = {
        scope: 'base',
        filter: '(objectClass=group)',
        attributes: this.config.groupAttributes
      };

      return new Promise((resolve, reject) => {
        this.client.search(groupDN, searchOptions, (error, res) => {
          if (error) {
            reject(error);
            return;
          }

          let groupDetails = null;
          res.on('searchEntry', (entry) => {
            groupDetails = this.parseGroupEntry(entry);
          });

          res.on('error', (error) => {
            reject(error);
          });

          res.on('end', () => {
            resolve(groupDetails);
          });
        });
      });
    } catch (error) {
      logger.error('Failed to get group details:', error);
      throw error;
    }
  }

  // Parse group entry from AD
  parseGroupEntry(entry) {
    const attributes = entry.attributes;
    const group = {};

    attributes.forEach(attr => {
      const name = attr.type;
      const values = attr.values;

      if (values && values.length > 0) {
        group[name] = values.length === 1 ? values[0] : values;
      }
    });

    return {
      dn: entry.dn.toString(),
      name: group.cn,
      description: group.description,
      members: group.member || [],
      guid: group.objectGUID,
      created: group.whenCreated,
      modified: group.whenChanged
    };
  }

  // Search users in AD
  async searchUsers(searchTerm, limit = 50) {
    try {
      const searchOptions = {
        scope: 'sub',
        filter: `(|(cn=*${searchTerm}*)(sAMAccountName=*${searchTerm}*)(mail=*${searchTerm}*)(displayName=*${searchTerm}*))`,
        attributes: this.config.userAttributes,
        sizeLimit: limit
      };

      return new Promise((resolve, reject) => {
        this.client.search(this.config.userSearchBase, searchOptions, (error, res) => {
          if (error) {
            reject(error);
            return;
          }

          const users = [];
          res.on('searchEntry', (entry) => {
            users.push(this.parseUserEntry(entry));
          });

          res.on('error', (error) => {
            reject(error);
          });

          res.on('end', () => {
            resolve(users);
          });
        });
      });
    } catch (error) {
      logger.error('Failed to search users:', error);
      throw error;
    }
  }

  // Search groups in AD
  async searchGroups(searchTerm, limit = 50) {
    try {
      const searchOptions = {
        scope: 'sub',
        filter: `(|(cn=*${searchTerm}*)(description=*${searchTerm}*))`,
        attributes: this.config.groupAttributes,
        sizeLimit: limit
      };

      return new Promise((resolve, reject) => {
        this.client.search(this.config.groupSearchBase, searchOptions, (error, res) => {
          if (error) {
            reject(error);
            return;
          }

          const groups = [];
          res.on('searchEntry', (entry) => {
            groups.push(this.parseGroupEntry(entry));
          });

          res.on('error', (error) => {
            reject(error);
          });

          res.on('end', () => {
            resolve(groups);
          });
        });
      });
    } catch (error) {
      logger.error('Failed to search groups:', error);
      throw error;
    }
  }

  // Sync users from AD
  async syncUsers() {
    try {
      logger.info('Starting AD user sync...');
      
      const users = await this.searchUsers('*', 1000);
      const syncedUsers = [];

      for (const user of users) {
        try {
          // Map AD user to intercom user
          const intercomUser = {
            id: user.guid,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            title: user.title,
            department: user.department,
            phone: user.phone,
            manager: user.manager,
            source: 'active_directory',
            lastSync: new Date(),
            isActive: true
          };

          // Store in cache
          this.userCache.set(user.username, intercomUser);
          syncedUsers.push(intercomUser);
        } catch (error) {
          logger.error(`Failed to sync user ${user.username}:`, error);
        }
      }

      logger.info(`AD user sync completed: ${syncedUsers.length} users synced`);
      return syncedUsers;
    } catch (error) {
      logger.error('Failed to sync users from AD:', error);
      throw error;
    }
  }

  // Sync groups from AD
  async syncGroups() {
    try {
      logger.info('Starting AD group sync...');
      
      const groups = await this.searchGroups('*', 1000);
      const syncedGroups = [];

      for (const group of groups) {
        try {
          // Map AD group to intercom group
          const intercomGroup = {
            id: group.guid,
            name: group.name,
            description: group.description,
            source: 'active_directory',
            lastSync: new Date(),
            isActive: true,
            members: group.members || []
          };

          // Store in cache
          this.groupCache.set(group.name, intercomGroup);
          syncedGroups.push(intercomGroup);
        } catch (error) {
          logger.error(`Failed to sync group ${group.name}:`, error);
        }
      }

      logger.info(`AD group sync completed: ${syncedGroups.length} groups synced`);
      return syncedGroups;
    } catch (error) {
      logger.error('Failed to sync groups from AD:', error);
      throw error;
    }
  }

  // Start periodic sync
  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncUsers();
        await this.syncGroups();
      } catch (error) {
        logger.error('Periodic AD sync failed:', error);
      }
    }, this.config.syncInterval);

    logger.info(`AD periodic sync started (interval: ${this.config.syncInterval}ms)`);
  }

  // Stop periodic sync
  stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      logger.info('AD periodic sync stopped');
    }
  }

  // Get cached user
  getCachedUser(username) {
    return this.userCache.get(username);
  }

  // Get cached group
  getCachedGroup(groupName) {
    return this.groupCache.get(groupName);
  }

  // Get all cached users
  getAllCachedUsers() {
    return Array.from(this.userCache.values());
  }

  // Get all cached groups
  getAllCachedGroups() {
    return Array.from(this.groupCache.values());
  }

  // Get AD connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isEnabled: this.config.enabled,
      url: this.config.url,
      baseDN: this.config.baseDN,
      userCount: this.userCache.size,
      groupCount: this.groupCache.size,
      syncInterval: this.config.syncInterval,
      lastSync: this.lastSync || null
    };
  }

  // Clean up resources
  async cleanup() {
    this.stopPeriodicSync();
    
    if (this.client) {
      this.client.unbind();
      this.client = null;
    }
    
    this.isConnected = false;
    this.userCache.clear();
    this.groupCache.clear();
    
    logger.info('Active Directory service cleaned up');
  }
}

// Initialize the service
const activeDirectoryService = new ActiveDirectoryService();

// Initialize on startup
activeDirectoryService.initialize().catch(error => {
  logger.error('Failed to initialize Active Directory service:', error);
});

module.exports = {
  activeDirectoryService,
  ActiveDirectoryService,
};
