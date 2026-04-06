jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('HASHED'),
  compare: jest.fn().mockResolvedValue(true)
}));

jest.mock('../model/Account', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndDelete: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  create: jest.fn()
}));

const Account = require('../model/Account');
const dao = require('../model/accountDao');

function chain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result)
  };
}

describe('accountDao additional coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getUserByEmail/getAccountById/getAllStatus/getAccountsByTypeAndStatus', async () => {
    Account.findOne.mockReturnValueOnce(chain({ email: 'a@b.com' }));
    await expect(dao.getUserByEmail('A@B.COM')).resolves.toEqual({ email: 'a@b.com' });

    await expect(dao.getAccountById('')).resolves.toBeNull();
    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    await expect(dao.getAccountById('1')).resolves.toEqual({ _id: '1' });

    Account.find.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue([{ status: 'Pending' }]) });
    await expect(dao.getAllStatus()).resolves.toEqual([{ status: 'Pending' }]);

    await expect(dao.getAccountsByTypeAndStatus('', 'Approved')).rejects.toThrow('accountType is required');
    await expect(dao.getAccountsByTypeAndStatus('Reviewer', '')).rejects.toThrow('status is required');
    Account.find.mockReturnValueOnce(chain([{ _id: 'r1' }]));
    await expect(dao.getAccountsByTypeAndStatus('Reviewer', 'Approved')).resolves.toEqual([{ _id: 'r1' }]);
  });

  test('setAccountStatus validates values', async () => {
    await expect(dao.setAccountStatus('', 'Approved')).rejects.toThrow('applicationId is required');
    await expect(dao.setAccountStatus('1', 'Oops')).rejects.toThrow('Invalid status');
    Account.findByIdAndUpdate.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1', status: 'Approved' }) });
    await expect(dao.setAccountStatus('1', 'Approved')).resolves.toEqual({ _id: '1', status: 'Approved' });
  });

  test('delete/update committee info/list all committee members', async () => {
    await expect(dao.deleteAccountByIdNonAdmin('')).rejects.toThrow('accountId is required');
    Account.findOneAndDelete.mockReturnValueOnce(chain({ _id: '2' }));
    await expect(dao.deleteAccountByIdNonAdmin('2')).resolves.toEqual({ _id: '2' });

    await expect(dao.updateCommitteeInfo('', {})).rejects.toThrow('accountId is required');
    Account.findOneAndUpdate.mockReturnValueOnce(chain({ _id: 'c1', committeeInfo: { name: 'Jane' } }));
    await expect(dao.updateCommitteeInfo('c1', { name: 'Jane', loyolaEmail: 'J@L.EDU', departmentArea: 'Bio', description: 'Desc' })).resolves.toEqual({ _id: 'c1', committeeInfo: { name: 'Jane' } });

    Account.find.mockReturnValueOnce(chain([{ _id: 'c1' }]));
    await expect(dao.getCommitteeMemberInfoList()).resolves.toEqual([{ _id: 'c1' }]);
  });

  test('createAccountByAdmin validates and creates accounts', async () => {
    await expect(dao.createAccountByAdmin({})).rejects.toThrow('accountType and password are required');
    await expect(dao.createAccountByAdmin({ accountType: 'Bad', password: 'pw' })).rejects.toThrow('Invalid account type');
    await expect(dao.createAccountByAdmin({ accountType: 'Student', password: 'pw' })).rejects.toThrow('email is required');

    Account.findOne.mockReturnValueOnce(chain({ _id: 'dup' }));
    await expect(dao.createAccountByAdmin({ accountType: 'Student', email: 'a@b.com', password: 'pw' })).rejects.toThrow('An account with that email already exists');

    Account.findOne.mockReturnValueOnce(chain(null));
    Account.create.mockResolvedValueOnce({ toObject: () => ({ accountType: 'Admin', username: 'Boss' }) });
    await expect(dao.createAccountByAdmin({ accountType: 'Admin', email: 'boss@example.com', username: 'Boss', password: 'pw', status: 'Approved' })).resolves.toEqual({ accountType: 'Admin', username: 'Boss' });
  });

  test('updateAccountByAdmin validates and updates with duplicate checks', async () => {
    await expect(dao.updateAccountByAdmin('', {})).rejects.toThrow('accountId is required');
    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    await expect(dao.updateAccountByAdmin('1', {})).rejects.toThrow('Account not found');

    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    await expect(dao.updateAccountByAdmin('1', { accountType: 'Bad' })).rejects.toThrow('Invalid account type');

    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    Account.findOne.mockReturnValueOnce(chain({ _id: 'dup' }));
    await expect(dao.updateAccountByAdmin('1', { email: 'dup@example.com' })).rejects.toThrow('An account with that email already exists');

    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    await expect(dao.updateAccountByAdmin('1', { status: 'Wrong' })).rejects.toThrow('Invalid status');

    Account.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    Account.findOne.mockReturnValueOnce(chain(null));
    Account.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: '1', email: 'new@example.com', status: 'Approved' }));
    await expect(dao.updateAccountByAdmin('1', { accountType: 'Reviewer', email: 'new@example.com', username: 'rev', subjectArea: 'bio', status: 'Approved', password: 'pw' })).resolves.toEqual({ _id: '1', email: 'new@example.com', status: 'Approved' });
  });
});
