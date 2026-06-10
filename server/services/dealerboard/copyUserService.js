const { getUserById } = require('../../db/users');
const { getAssignmentsByUserId } = require('../../db/dealerboard/buttonAssignments');
const { listSpeedDialsByUserId } = require('../../db/dealerboard/speedDials');
const { LineOperationError } = require('./errors');

async function prepareUserCopy(sourceUserId, body) {
  const { username, email, firstName, lastName, copyAssignments, copySpeedDials } = body;

  if (!username || !email || !firstName || !lastName) {
    throw new LineOperationError(400, 'Username, email, first name, and last name are required');
  }

  const sourceUser = await getUserById(sourceUserId);
  if (!sourceUser) {
    throw new LineOperationError(404, 'Source user not found');
  }

  const userData = {
    username,
    email,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    role: sourceUser.role || 'user',
    extension: sourceUser.extension || '',
    sipUri: sourceUser.sipUri || '',
    employeeId: sourceUser.employeeId || '',
    department: sourceUser.department || '',
    isActive: true,
  };

  let assignments = [];
  let speedDials = [];

  if (copyAssignments) {
    assignments = await getAssignmentsByUserId(sourceUserId);
  }

  if (copySpeedDials) {
    const rows = await listSpeedDialsByUserId(sourceUserId);
    speedDials = rows.map((row) => ({
      name: row.name,
      number: row.number,
      description: row.description,
    }));
  }

  return {
    success: true,
    userData,
    assignments,
    speedDials,
    message: 'User data ready for creation',
  };
}

module.exports = {
  prepareUserCopy,
};
