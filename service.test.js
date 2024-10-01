const request = require('supertest');
const app = require('./src/service.js');
const { Role, DB } = require('./src/database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let randomUserAuthToken;



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

// update user FIXME (NEEDS ADMIN PRIVILEGES??)
test('update user', async () => {
    const newRandomUser = await createAndRegisterRandomUser();
    const loginRes = await request(app).put('/api/auth').send(newRandomUser);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);
    const adminToken = adminLoginRes.body.token;

    const newInfo = {"email" : "blingyIceCaves@northpole", "password" : newRandomUser.password};
    //console.log(randomUserId);
    //console.log(loginRes.body.user.id); these two lines print same number
    const updateRes = await request(app).put(`/api/auth/`).set('Authorization', `Bearer ${adminToken}`).set('userId', loginRes.body.user.id).send(newInfo);
    expect(updateRes.status).toBe(200);
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

    const { id, ...receivedItem } = addItemRes.body[secondLength - 1];
    expect(receivedItem).toMatchObject(newItem);
});

// create and get orders FIXME (get some code for making franchises up and running)
test('create and get orders', async () => {
    const newUser = await createAndRegisterRandomUser();
    const newUserLoginRes = await loginUser(newUser);

    // get orders for this new user
    const newUserGetOrders = await request(app).get('/api/order').set('Authorization', `Bearer ${newUserLoginRes.body.token}`);
    expect(newUserGetOrders.status).toBe(200);

    const { dinerId, ...orders } = newUserGetOrders.body;
    const originalLength = newUserGetOrders.body.length;

    // create a franchise with an admin
    const adminUser = await createAdmin();
    const adminLoginRes = await loginUser(adminUser);

    const newFranchise = createRandomFranchise({"email" : adminUser.email});
    const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminLoginRes.body.token}`).send(newFranchise);
    expect(createFranchiseRes.status).toBe(200);

});


// Franchise tests

//
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

    const { name, admins, id } = createFranchiseRes.body;
    expect(name).toBe(newFranchise.name);
    expect(admins[0].email).toBe(adminUser.email);

    const getFranchisesRes2 = await request(app).get('/api/franchise');
    const secondLength = getFranchisesRes2.body.length;
    expect(getFranchisesRes2.status).toBe(200);

    expect(secondLength).toBe(originalLength + 1);

    console.log(getFranchisesRes2.body);
    console.log(newFranchise);

    const expectedObject = {name : newFranchise.name, id : createFranchiseRes.body.id, stores : []};
    expect(getFranchisesRes2.body).toEqual(expect.arrayContaining([expectedObject]));
});
