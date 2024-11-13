const request = require('supertest');
const app = require('./src/service.js');
const { Role, DB } = require('./src/database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let randomUserAuthToken;
let testUserAuthToken;
let testUserId;


function generateRandomEmail() {
    return Math.random().toString(36).substring(2, 12) + '@test.com';
}

function generateRandomName() {
    return Math.random().toString(20).substring(2,10);
}

async function createAdmin() {
    let user = {password: 'ihavemanysecrets', roles: [{role : Role.Admin}]};
    user.name = generateRandomName();
    user.email = user.name + '@admin.com';

    await DB.addUser(user);

    user.password = 'ihavemanysecrets';
    return user;
}

async function createAndRegisterRandomUser() {
    const newUser = { name: 'Mr. Rando', email : generateRandomEmail(), password : 'something'};
    const registerRes = await request(app).post('/api/auth').send(newUser);
    randomUserAuthToken = registerRes.body.token;
    return newUser;
}

async function loginUser(user) {
    const loginRes = await request(app).put('/api/auth').send(user);
    return loginRes;
}

function createRandomPizzaObject() {
    const pizza = {};
    pizza.title = Math.random(20).toString(20).substring(2,12);
    pizza.description = "a pizza with a lot of thought put into it";
    pizza.price = Math.round(Math.random() * 10) / 10;
    pizza.image = Math.random(10).toString(10).substring(2,6) + ".png";

    return pizza;
}

function createRandomFranchise(admins) {
    const franchise = {};
    franchise.name = generateRandomName();
    franchise.admins = [admins];

    return franchise;
}

beforeAll(async () => {
    testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUserId = registerRes.body.user.id;
    testUserAuthToken = registerRes.body.token;
  });

// LOGIN/LOGOUT/UPDATE USER TESTS
// Simple login test
test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
  expect(password).toBe(testUser.password);
});

// log out test
test('logout', async () => {
    const newRandomUser = await createAndRegisterRandomUser();
    const loginRes = await request(app).put('/api/auth').send(newRandomUser);
    expect(loginRes.status).toBe(200);

    const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${randomUserAuthToken}`).send(newRandomUser);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('logout successful');
});

// update user 
test('update user', async () => {
    const newRandomUser = await createAndRegisterRandomUser();
    const loginRes = await request(app).put('/api/auth').send(newRandomUser);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);
    const adminToken = adminLoginRes.body.token;

    const newInfo = {"email" : "blingyIceCaves@northpole", "password" : newRandomUser.password};
    const updateRes = await request(app).put(`/api/auth/${loginRes.body.user.id}`).set('Authorization', `Bearer ${adminToken}`).send(newInfo);
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.email).toBe(newInfo.email);
});

// GENERIC PATH TESTS
// no path
test('no path', async () => {
    const noPathRes = await request(app).get('/').send(testUser);
    expect(noPathRes.status).toBe(200);
    expect(noPathRes.body.message).toBe('welcome to JWT Pizza');
});

// unknown endpoint
test('unknown endpoint', async () => {
    const noEndpointRes = await request(app).get('/bananasplit').send(testUser);
    expect(noEndpointRes.status).toBe(404);
    expect(noEndpointRes.body.message).toBe('unknown endpoint');
});

// ORDER TESTS

// add item to the menu
test('add item to menu', async () => {
    // setup admin
    const adminUser = await createAdmin();
    const adminLoginRes = await request(app).put('/api/auth').send(adminUser);
    expect(adminLoginRes.status).toBe(200);
    expect(adminLoginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

    // get menu
    const getMenuRes = await request(app).get('/api/order/menu');
    const originalLength = getMenuRes.body.length;
    expect(getMenuRes.status).toBe(200);

    // set up new pizza item
    const newItem = createRandomPizzaObject();

    // add to menu
    const addItemRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newItem);
    expect(addItemRes.status).toBe(200);

    const secondLength = addItemRes.body.length;
    expect(originalLength).toBe(secondLength - 1);

    // response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
    const { title, description, image, price } = addItemRes.body[secondLength - 1];
    const receivedObject = {title, description, image, price};
    expect(receivedObject).toMatchObject(newItem);
});

// create and get orders FIXME (get some code for making franchises up and running)
test('create orders', async () => {
    const newUser = await createAndRegisterRandomUser();
    const newUserLoginRes = await loginUser(newUser);

    // get orders for this new user
    const newUserGetOrdersRes = await request(app).get('/api/order').set('Authorization', `Bearer ${newUserLoginRes.body.token}`);
    expect(newUserGetOrdersRes.status).toBe(200);

    // create a franchise with an admin
    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);

    const newFranchise = createRandomFranchise({"email" : adminUser.email});
    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newFranchise);
    expect(createFranchiseRes.status).toBe(200);

    // create store
    const newStore = {franchiseId: createFranchiseRes.body.id, name: generateRandomName()};
    const addStoreRes = await request(app).post(`/api/franchise/${newStore.franchiseId}/store`).set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newStore);
    expect(addStoreRes.status).toBe(200);


    // add new item to menu
    const newItem = createRandomPizzaObject();
    const addItemRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newItem);
    expect(addItemRes.status).toBe(200);

    const order = {franchiseId : createFranchiseRes.body.id, storeId : addStoreRes.body.id, items: [{menuId : addItemRes.body[0].id, description : addItemRes.body[0].description, price : addItemRes.body[0].price}]};
    //console.log(order);
    const makeOrderRes = await request(app).post('/api/order').set('Authorization', `Bearer ${newUserLoginRes.body.token}`).send(order);
    //console.log(makeOrderRes.body);
    expect(makeOrderRes.status).toBe(200);
});


// FRANCHISE TESTS

test('create new franchise', async () => {
    // create admin
    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);

    // get franchises
    const getFranchisesRes = await request(app).get('/api/franchise');
    const originalLength = getFranchisesRes.body.length;
    expect(getFranchisesRes.status).toBe(200);

    const newFranchise = createRandomFranchise({"email" : adminUser.email});
    //console.log(newFranchise);

    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newFranchise);
    expect(createFranchiseRes.status).toBe(200);

    const { name, admins } = createFranchiseRes.body;
    expect(name).toBe(newFranchise.name);
    expect(admins[0].email).toBe(adminUser.email);

    const getFranchisesRes2 = await request(app).get(`/api/franchise`);
    const secondLength = getFranchisesRes2.body.length;
    expect(getFranchisesRes2.status).toBe(200);

    expect(secondLength).toBe(originalLength + 1);

    //console.log(getFranchisesRes2.body);
    //console.log(newFranchise);

    const expectedObject = {name : newFranchise.name, id : createFranchiseRes.body.id, stores : []};
    expect(getFranchisesRes2.body).toEqual(expect.arrayContaining([expectedObject]));
});

test('add store to franchise', async () => {
    // create admin
    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);

    // make new franchise
    const newFranchise = createRandomFranchise({"email" : adminUser.email});
    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newFranchise);
    expect(createFranchiseRes.status).toBe(200);

    // make store
    const newStore = {franchiseId: createFranchiseRes.body.id, name: generateRandomName()};
    const addStoreRes = await request(app).post(`/api/franchise/${newStore.franchiseId}/store`).set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newStore);
    expect(addStoreRes.status).toBe(200);

    // ensure received values are the same
    const { franchiseId, name } = addStoreRes.body;
    expect(franchiseId).toBe(newStore.franchiseId);
    expect(name).toBe(newStore.name);
});

test('list a user\'s franchises', async () => {
    // make user
    const newAdmin = await createAdmin();
    const loginRes = await loginUser(newAdmin);

    //make a franchise for test user
    const newFranchise = createRandomFranchise({"email" : testUser.email});
    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(newFranchise);
    const adminInfo = createFranchiseRes.body.admins[0];
    expect(createFranchiseRes.status).toBe(200);

    const listFranchisesRes = await request(app).get(`/api/franchise/${testUserId}`).set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(listFranchisesRes.status).toBe(200);
    expect(listFranchisesRes.body[0].name).toBe(newFranchise.name);
    expect(listFranchisesRes.body[0].admins[0]).toMatchObject(adminInfo);
});

// delete franchise
test('delete franchise', async () => {
    const newAdmin = await createAdmin();
    const loginRes = await loginUser(newAdmin);

    // make a franchise for test user
    const newFranchise = createRandomFranchise({"email" : testUser.email});
    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(newFranchise);
    expect(createFranchiseRes.status).toBe(200);
    
    // delete it 
    const deleteFranchiseRes = await request(app).delete(`/api/franchise/${createFranchiseRes.body.id}`).set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(deleteFranchiseRes.status).toBe(200);
    expect(deleteFranchiseRes.body.message).toBe('franchise deleted');
});