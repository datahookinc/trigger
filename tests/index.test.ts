import { renderHook, act, waitFor } from '@testing-library/react';
import { CreateQueue, CreateSingle, CreateTable, CreateStore } from '../src';
import 'isomorphic-fetch'; // required because jest does not recognize node's global fetch API (even though it should when using node v18)

type Customer = {
    customerID: number;
    firstName: string;
    lastName: string;
}

type Order = {
    orderID: number;
    customerID: Customer['customerID'];
    orderDate: Date;
    orderLocation: string;
};

type Company = {
    companyID: number;
    name: string;
    location: string;
}

type Cat = {
    name: string;
    age: number;
}

const store = CreateStore({
    tables: {
        customers: CreateTable<Customer>(['customerID', 'firstName', 'lastName']),
        orders: CreateTable<Order>(['orderID', 'customerID', 'orderLocation', 'orderDate']),
        company: CreateTable<Company>({ companyID: [1, 2, 3], name: ['abc', 'def', 'ghi'], location: ['CA', 'US', 'EU'] }),
        cat: CreateTable<Cat>(['name', 'age']),
    },
    queues: {
        eventQueue: CreateQueue<string>(),
    },
    singles: {
        numProductsOutOfStock: CreateSingle(0),
        pendingActions: CreateSingle(false),
        countChangesToNumProductsOutOfStock: CreateSingle(0),
        numUpdates: CreateSingle(0),
    },
});

/*** SETUP TRIGGERS */
store.queues.eventQueue.onInsert(() => {
    store.singles.pendingActions.set(true);
});

store.queues.eventQueue.onGet(() => {
    store.singles.pendingActions.set(false);
});

store.singles.numProductsOutOfStock.onSet(() => {
    store.singles.countChangesToNumProductsOutOfStock.setFn(cv => cv + 1);
});

store.singles.numProductsOutOfStock.onGet(() => {
    store.singles.countChangesToNumProductsOutOfStock.setFn(cv => cv + 1);
});

store.tables.customers.onAfterInsert((v) => {
    store.tables.orders.insertOne({ orderID: 100, customerID: v.customerID, orderDate: new Date(), orderLocation: '' });
});

store.tables.customers.onBeforeInsert((v) => {
    if (v.firstName === 'OmitMe') {
        return false;
    }

    if (v.lastName === 'ChangeMe') {
        v.lastName = 'Changed';
        return v;
    }
});

store.tables.customers.onBeforeDelete((v) => {
    if (v.firstName === 'OmitMe') {
        return false;
    }
});

store.tables.customers.onAfterDelete((v) => {
    store.tables.orders.deleteMany({ customerID: v.customerID });
});

store.tables.customers.onAfterUpdate((_, nv) => {
    if (nv.customerID === 10) {
        store.singles.numUpdates.set(store.singles.numUpdates.get() + 1);
    }
});

store.tables.customers.onBeforeUpdate((cv, nv) => {
    if (cv.firstName === 'UpdateMe') {
        nv.firstName = 'Changed before update';
        return nv;
    }
});


describe('Testing Tables', () => {
    it('should increment autoID when inserting new rows', () => {
        const { result } = renderHook(() => store.tables.customers.use());
        act(() => {
            store.tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly' });
            store.tables.customers.insertOne({ customerID: 2, firstName: 'Sally', lastName: 'WrongLastName' });
            store.tables.customers.insertOne({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        });
        expect(result.current.length).toBe(3);
        expect(result.current.slice(-1)[0]._id).toBe(3);
    });
    it('should filter the results with the function approach', () => {
        const { result } = renderHook(() => store.tables.customers.use(row => row.firstName === 'Billy'));
        expect(result.current.length).toBe(1);
        expect(result.current[0].firstName === 'Billy');
    });
    it('should filter the results with the object approach', () => {
        const { result } = renderHook(() => store.tables.customers.use({ firstName: 'Billy', lastName: 'McBilly' }));
        expect(result.current.length).toBe(1);
        expect(result.current[0].firstName === 'Billy');
    });
    it('should return all table rows', () => {
        const rows = store.tables.customers.find();
        expect(rows.length).toBe(3);
    });

    it('should scan all table rows', () => {
        let n = 0;
        store.tables.customers.scan((_, idx) => { n = idx });
        expect(n).toBe(2);
    });

    it('should stop scanning early', () => {
        let n = 0;
        store.tables.customers.scan((row, idx) => { n = idx; return row.firstName !== 'Sally' });
        expect(n).toBe(1);
    });

    it('should return undefined when row does not exist', () => {
        const { result } = renderHook(() => store.tables.customers.useById(-1));
        expect(result.current).toBeUndefined();
    });

    it('should return row when it exists', () => {
        const { result } = renderHook(() => store.tables.customers.useById(2));
        expect(result.current?._id).toBe(2);
        expect(result.current?.firstName).toBe('Sally');
    });

    it('should update the row using the object approach', () => {
        let order = store.tables.orders.findById(1);
        if (order) {
            store.tables.orders.updateById(order._id, { orderLocation: 'Canada' });
            order = store.tables.orders.findById(order._id);
            expect(order?.orderLocation).toEqual('Canada');
        } else {
            fail('order could not be found');
        }
    });

    it('should update the row using the function approach', () => {
        let order = store.tables.orders.findById(1);
        if (order) {
            store.tables.orders.updateById(order._id, (o) => {
                o.orderLocation = 'Europe';
                return o;
            });
            order = store.tables.orders.findById(order._id);
            expect(order?.orderLocation).toEqual('Europe');
        } else {
            fail('order could not be found');
        }
    });

    it('should update all rows using the object approach without a where clause', () => {
        let orders = store.tables.orders.find();
        expect(orders.length).toEqual(3);
        store.tables.orders.updateMany({ orderLocation: 'America' });
        orders = store.tables.orders.find({ orderLocation: 'America' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the object approach with an object where clause', () => {
        let orders = store.tables.orders.find();
        expect(orders.length).toEqual(3);
        store.tables.orders.updateMany({ orderLocation: 'Europe' }, { orderLocation: 'America' });
        orders = store.tables.orders.find({ orderLocation: 'Europe' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the function approach without a where clause', () => {
        let orders = store.tables.orders.find();
        expect(orders.length).toEqual(3);
        store.tables.orders.updateMany((o) => ({ ...o, orderLocation: 'America' }));
        orders = store.tables.orders.find({ orderLocation: 'America' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the function approach with a function where clause', () => {
        let orders = store.tables.orders.find();
        expect(orders.length).toEqual(3);
        store.tables.orders.updateMany(
            (o) => ({ ...o, orderLocation: 'Europe' }),
            (o) => o.orderLocation === 'America',
        );
        orders = store.tables.orders.find({ orderLocation: 'Europe' });
        expect(orders.length).toEqual(3);
    });

    it('should return an undefined row when the row is removed', () => {
        const { result } = renderHook(() => store.tables.customers.useById(3));
        act(() => {
            store.tables.customers.deleteById(3);
        });
        expect(result.current).toBeUndefined();
    });

    it('should insert the new row', () => {
        const customer = store.tables.customers.insertOne({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        expect(customer?.firstName).toBe('Tammy');
    });

    it('should be notified of updates when a table row is updated', () => {
        const { result } = renderHook(() => store.tables.customers.useById(2));
        act(() => {
            store.tables.customers.updateById(2, { lastName: 'McBilly' });
        });
        expect(result.current?.lastName).toBe('McBilly');
    });

    it('should find all table rows when passing a function', () => {
        const { result } = renderHook(() =>
            store.tables.customers.find((v) => {
                return v.firstName === 'Billy' || v.firstName === 'Tammy';
            }),
        );
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Tammy');
    });

    it('should find all table rows when passing an object', () => {
        const { result } = renderHook(() => store.tables.customers.find({ lastName: 'McBilly' }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Sally');
    });

    it('should return an empty array when finding all table rows with non-matching function', () => {
        const { result } = renderHook(() =>
            store.tables.customers.find((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current.length).toBe(0);
    });

    it('should return an empty array when finding all table rows with non-matching object', () => {
        const { result } = renderHook(() => store.tables.customers.find({ firstName: 'Teddy' }));
        expect(result.current.length).toBe(0);
    });

    it('should find the table row when passing the PK', () => {
        const result = store.tables.customers.findById(1);
        expect(result?.firstName).toBe('Billy');
    });

    it('should find the first table row when passing a function', () => {
        const { result } = renderHook(() =>
            store.tables.customers.findOne((v) => {
                return v.firstName === 'Billy' || v.firstName === 'Tammy';
            }),
        );
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).toBeTruthy();
        if (result.current) {
            expect(result.current.firstName).toBe('Billy');
        }
    });

    it('should find the first table row when passing an object', () => {
        const result = store.tables.customers.findOne({ lastName: 'McBilly' });
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result).toBeTruthy();
        expect(result?.firstName).toBe('Billy');
    });

    it('should return undefined when finding a table row with non-matching function', () => {
        const { result } = renderHook(() =>
            store.tables.customers.findOne((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current).toBeUndefined();
    });

    it('should return undefined when finding a table row with non-matching object', () => {
        const { result } = renderHook(() => store.tables.customers.findOne({ firstName: 'Teddy' }));
        expect(result.current).toBeUndefined();
    });

    it('should return false when deleting a row that cannot be found', () => {
        const deleted = store.tables.customers.deleteById(10);
        expect(deleted).toBe(false);
    });

    it('should return true when deleting a customer using the autoID', () => {
        const c = store.tables.customers.findOne({ lastName: 'McBilly' });
        const n = store.tables.customers.count();
        expect(c).toBeTruthy();
        if (c) {
            const deleted = store.tables.customers.deleteById(c._id);
            const newN = store.tables.customers.count();
            expect(deleted).toEqual(true);
            expect(newN).toEqual(n - 1);
            // add the row back in for future tests
            store.tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly' });
        }
    });

    it('getRows() should return the same number of rows as getRowCount()', () => {
        const n = store.tables.customers.count({ lastName: 'McBilly' });
        expect(n).toEqual(2);
        const o = store.tables.customers.find({ lastName: 'McBilly' });
        expect(o.length).toEqual(2);
        const o1 = store.tables.customers.find((v) => v.lastName === 'McBilly');
        expect(o1.length).toEqual(2);
        expect(n).toEqual(o.length);
        expect(n).toEqual(o1.length);
    });

    it('should return 1 when deleting a customer using the object approach', () => {
        const n = store.tables.customers.count();
        const num = store.tables.customers.deleteMany({ lastName: 'McTammy' });
        const newN = store.tables.customers.count();
        expect(num).toEqual(1);
        expect(newN).toEqual(n - 1);
        // add the row back in for future tests
        store.tables.customers.insertOne({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
    });

    it('should return 1 when deleting a customer using the function approach', () => {
        const n = store.tables.customers.count();
        const num = store.tables.customers.deleteMany((v) => v.lastName === 'McTammy');
        const newN = store.tables.customers.count();
        expect(num).toEqual(1);
        expect(newN).toEqual(n - 1);
        // add the row back in for future tests
        store.tables.customers.insertOne({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
    });

    it('should delete all rows when the call to deleteTableRows is undefined', () => {
        const n = store.tables.customers.count();
        const num = store.tables.customers.deleteMany();
        const newN = store.tables.customers.count();
        expect(num).toEqual(n);
        expect(newN).toEqual(0);
    });

    it('should insert multiple rows when using insertRows', () => {
        store.tables.orders.insertMany([
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1234 },
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1235 },
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1236 },
        ]);
        const n = store.tables.orders.count({ customerID: 999 });
        expect(n).toEqual(3);
        store.tables.orders.deleteMany({ customerID: 999 });
    });

    it('should return the column names for the table', () => {
        const expectedColumns = ['_id', 'orderID', 'customerID', 'orderLocation', 'orderDate'];
        const columns = store.tables.orders.columnNames();
        expect(columns.every(v => expectedColumns.includes(v))).toBe(true);
    });
});

describe('Testing TriggerQueue', () => {
    it('should insert an item to the queue', () => {
        store.queues.eventQueue.insert('openEvent');
        expect(store.queues.eventQueue.size()).toEqual(1);
    });
    it('should get an item from the queue', () => {
        store.queues.eventQueue.get();
        expect(store.queues.eventQueue.size()).toEqual(0);
    });
    it('should return undefined when getting from an empty queue', () => {
        const v = store.queues.eventQueue.get();
        expect(v).toBeUndefined();
    });
    it('should return 0 when getting size of empty queue', () => {
        const v = store.queues.eventQueue.size();
        expect(v).toEqual(0);
    });

    test('queue insertItem should trigger to change pendingActions single to "true"', () => {
        store.singles.pendingActions.set(false);
        let v = store.singles.pendingActions.get();
        expect(v).toEqual(false);
        store.queues.eventQueue.insert('testing queue trigger');
        v = store.singles.pendingActions.get();
        expect(v).toEqual(true);
    });

    test('queue getItem should trigger to change pendingActions single to "false"', () => {
        store.singles.pendingActions.set(true);
        let v = store.singles.pendingActions.get();
        expect(v).toEqual(true);
        store.queues.eventQueue.get();
        v = store.singles.pendingActions.get();
        expect(v).toEqual(false);
    });
});

describe('Testing singles', () => {
    it('should increment from the old value', () => {
        const currentValue = store.singles.numProductsOutOfStock.get();
        store.singles.numProductsOutOfStock.setFn(cv => cv + 1);
        const newValue = store.singles.numProductsOutOfStock.get();
        expect(newValue).toEqual(currentValue + 1);
        // reset count for trigger tests
        store.singles.countChangesToNumProductsOutOfStock.set(0);
    });
});

describe('Testing Single triggers', () => {
    it('should trigger an increment to countChangesToNumProductsOutOfStock when numProductsOutOfStock is set', () => {
        const v = store.singles.numProductsOutOfStock.set(100);
        expect(v).toEqual(100);
        store.singles.numProductsOutOfStock.set(200);
        store.singles.numProductsOutOfStock.set(300);
        const count = store.singles.countChangesToNumProductsOutOfStock.get();
        expect(count).toEqual(3);
    });

    it('should trigger an increment to countChangesToNumProductsOutOfStock with numProductsOutOfStock onGet', () => {
        store.singles.countChangesToNumProductsOutOfStock.set(0);
        store.singles.numProductsOutOfStock.get();
        const count = store.singles.countChangesToNumProductsOutOfStock.get();
        expect(count).toEqual(1);
    });
});

describe('Testing table triggers', () => {
    it('should add a new row to the "Orders" table', () => {
        const result = store.tables.customers.insertOne({ customerID: 10, firstName: 'fake', lastName: 'McCustomer' });
        expect(result?.customerID).toBe(10);
        const row = store.tables.orders.findOne({ customerID: 10 });
        expect(row).toBeTruthy();
        expect(row?.customerID).toEqual(10);
    });
    it('should delete all customer orders from the "Orders" table', () => {
        let n = store.tables.orders.count({ customerID: 10 });
        const numDeleted = store.tables.customers.deleteMany({ customerID: 10 });
        expect(numDeleted).toBeGreaterThan(0);
        expect(numDeleted).toEqual(n);
        n = store.tables.orders.count({ customerID: 10 });
        expect(n).toEqual(0);
    });
    it('should trigger for the "numUpdates" to update when updating a customer record', () => {
        const { result } = renderHook(() => store.singles.numUpdates.use());
        act(() => {
            const c = store.tables.customers.insertOne({ customerID: 10, firstName: 'fake', lastName: 'McCustomer' });
            expect(c).toBeTruthy();
            if (c) {
                store.tables.customers.updateById(c._id, { firstName: 'NewFakeName' });
                store.tables.customers.updateById(c._id, { firstName: 'NewNewFakeName' });
                store.tables.customers.updateById(c._id, { firstName: 'OldFakeName' });
            }
        });
        expect(result.current).toEqual(3);
    });
    it('should not insert the row based on "onBeforeInsert" trigger', () => {
        const n = store.tables.customers.count();
        const c = store.tables.customers.insertOne({ customerID: 10, firstName: 'OmitMe', lastName: 'McCustomer' });
        expect(c).toEqual(undefined);
        const nv = store.tables.customers.count();
        expect(n).toEqual(nv);
    });
    it('should alter the row based on "onBeforeInsert" trigger', () => {
        const n = store.tables.customers.count();
        const c = store.tables.customers.insertOne({ customerID: 10, firstName: 'Happy', lastName: 'ChangeMe' });
        expect(c).toBeTruthy();
        const nv = store.tables.customers.count();
        expect(nv).toEqual(n + 1);
        expect(c?.lastName).toEqual('Changed');
    });
    it('should not delete the row based on "onBeforeDelete" trigger', () => {
        const n = store.tables.customers.count();
        const c = store.tables.customers.deleteOne({ firstName: 'OmitMe' });
        expect(c).toEqual(false);
        const nv = store.tables.customers.count();
        expect(n).toEqual(nv);
    });
    it('should update the value based on "onBeforeUpdate" trigger', () => {
        const c = store.tables.customers.insertOne({ customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' });
        expect(c).toBeTruthy();
        if (c) {
            const nv = store.tables.customers.updateById(c._id, { firstName: 'Something else' });
            expect(nv).toBeTruthy();
            expect(nv?.firstName).toEqual('Changed before update');
        }
    });
    it('should clear the table and reset the index', () => {
        store.tables.customers.clear();
        const c = store.tables.customers.insertMany([
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
        ]);
        expect(c).toBeTruthy();
        if (c) {
            expect(c[c.length - 1]._id).toBe(3);
        }
    });
    it('should clear the table and not reset the index', () => {
        const c = store.tables.customers.insertMany([
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
            { customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' },
        ]);
        store.tables.customers.clear(false);
        expect(c).toBeTruthy();
        if (c) {
            expect(c[c.length - 1]._id).toBe(6);
        }
    });
});

describe('Testing table initial values', () => {
    it('should have the proper _id when initializing with values', () => {
        const { result } = renderHook(() => store.tables.company.use());
        expect(result).toBeTruthy();
        if (result) {
            expect(result.current.length).toBe(3);
            expect(result.current.slice(-1)[0]._id).toBe(3);
            expect(result.current[0].location).toBe('CA');
        }
    });
});

describe('Testing error messages', () => {
    it('should return the proper error message when creating an empty table', () => {
        try {
            CreateTable({});
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: invalid initial arguments when creating table; cannot create an empty table`);
        }
    });
    it('should return the proper error message when creating a table with mismatched column lengths', () => {
        try {
            CreateTable({ name: [1, 2, 3], age: [1, 2] });
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: invalid initial arguments when creating table; column "age" has improper length of 2, which does not match the length of the other columns provided`);
        }
    });
    it('should return the proper error message when attempting to insert a row with properties not found in the table', () => {
        try {

            const table = CreateTable<{ name: string, age: number }>({ name: ["a", "b", "c"], age: [1, 2, 3] });
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            table.insertOne({ name: "a", age: 10, gender: "m" } as any);
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: attempting to insert value into column "gender", which does not exist in table`);
        }
    });
    it('should return the proper error message when attempting to insert a row without including all properties of the table', () => {
        try {

            const table = CreateTable<{ name: string, age: number }>({ name: ["a", "b", "c"], age: [1, 2, 3] });
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            table.insertOne({ name: "a" } as any);
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: did not provide column "age" when attempting to insert row into table`);
        }
    });
    it('should return the proper error message when attempting to insert rows with properties not found in the table', () => {
        try {

            const table = CreateTable<{ name: string, age: number }>({ name: ["a", "b", "c"], age: [1, 2, 3] });
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            table.insertMany([{ name: "a", age: 10, gender: "m" } as any]);
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: attempting to insert value into column "gender", which does not exist in table`);
        }
    });
    it('should return the proper error message when attempting to insert rows without including all properties of the table', () => {
        try {
            const table = CreateTable<{ name: string, age: number }>({ name: ["a", "b", "c"], age: [1, 2, 3] });
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            table.insertMany([{ name: "a" } as any]);
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in @datahook/trigger: did not provide column "age" when attempting to insert row into table`);
        }
    });
});

describe('Integration tests for useLoadData()', () => {
    it('should fetch the data and populate the table', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }));
        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(result.current.error).toBe(null);
            expect(result.current.data.length).toBe(2);
            expect(store.tables.cat.count()).toBe(2);
        });
    });
    it('should append data to the table', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { refreshMode: 'append' }));
        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(result.current.error).toBe(null);
            expect(result.current.data.length).toBe(4);
            expect(store.tables.cat.count()).toBe(4);
        });
    });
    it('should refresh the data and reset the index', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { resetIndex: true, refreshMode: 'replace' }));
        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(result.current.error).toBe(null);
            expect(result.current.data.length).toBe(2);
            expect(store.tables.cat.count()).toBe(2);
            expect(store.tables.cat.findById(1)).not.toBe(undefined);
        });
    });
    it("should refresh the data and only show cats named 'PJ'", async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { resetIndex: true, refreshMode: 'replace', filter: row => row.name === 'PJ' }));
        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(result.current.error).toBe(null);
            expect(result.current.data.length).toBe(1);
            expect(result.current.data[0].name).toBe('PJ');
            expect(store.tables.cat.count()).toBe(2);
            expect(store.tables.cat.findById(1)).not.toBe(undefined);
        });
    });
    it('should update the data when the table changes', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { resetIndex: true }));

        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(result.current.data.length).toBeGreaterThan(0);
        });

        act(() => {
            store.tables.cat.deleteById(1);
            store.tables.cat.updateById(2, { name: 'NewCat' });
        });

        await waitFor(() => {
            expect(result.current.data?.length).toBe(1);
            expect(store.tables.cat.count()).toBe(1);
            expect(store.tables.cat.findById(2)?.name).toBe('NewCat');
        });
    });
    it('should not render the table on update', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { resetIndex: true }));

        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(store.tables.cat.findById(2)?.name).toBe('Cleo');
            expect(result.current.data.length).toBeGreaterThan(0);
        });

        act(() => {
            store.tables.cat.updateById(2, { name: 'NewCat' }, false);
        });

        await waitFor(() => {
            expect(result.current.data?.length).toBe(2);
            expect(store.tables.cat.count()).toBe(2);
            expect(result.current.data[1].name).toBe('Cleo');
            expect(store.tables.cat.findById(2)?.name).toBe('NewCat');
        });
    });
    it('should not render the table on update many', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(() => {
            return fetch('http://localhost:3000/cats', { method: 'GET' }).then(res => res.json() as Promise<Cat[]>)
        }, { resetIndex: true }));

        await waitFor(() => {
            expect(result.current.status).toBe('success');
            expect(store.tables.cat.findById(2)?.name).toBe('Cleo');
            expect(result.current.data.length).toBeGreaterThan(0);
        });

        act(() => {
            store.tables.cat.updateMany(row => {
                return { name: `updated-${row.name}` }
            }, null, { render: false });
        });

        await waitFor(() => {
            expect(result.current.data?.length).toBe(2);
            expect(store.tables.cat.count()).toBe(2);
            expect(result.current.data[1].name).toBe('Cleo');
            expect(store.tables.cat.findById(2)?.name).toBe('updated-Cleo');
        });
    });
    it('should return an error and extract the error message', async () => {
        const { result } = renderHook(() => store.tables.cat.useLoadData(async () => {
            throw new Error('This is my error');
        }));
        await waitFor(() => {
            expect(result.current.status).toBe('error');
            expect(result.current.error).toBe('Error: This is my error');
        });
    });
    it('should return the table as a JSON string', async () => {
        const jsonString = store.tables.cat.toJSON(false);
        expect(jsonString).not.toEqual('');

        const parsed = JSON.parse(jsonString);
        expect(parsed.length).toEqual(2);
        expect(parsed[0]._id).toEqual(undefined);
    });

    it('should replace the _id when passed in', async () => {
        store.tables.cat.insertOne({ _id: 99, name: 'Cleo', age: 10 } as Cat);
        const cats = store.tables.cat.find();
        expect(cats.length).toEqual(3);
        expect(cats[2]._id).toEqual(3);
    });
});
