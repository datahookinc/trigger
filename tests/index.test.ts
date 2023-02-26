import { renderHook, act } from '@testing-library/react';
import { extract, CreateQueue, CreateSingle, CreateTable, type Store, type Table, type Queue, type Single } from '../src';

type Customer = {
    customerID: number;
    firstName: string;
    lastName: string;
};

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

interface MyStore extends Store {
    tables: {
        customers: Table<Customer>;
        orders: Table<Order>;
        company: Table<Company>;
    };
    queues: {
        eventQueue: Queue<string>;
    };
    singles: {
        numProductsOutOfStock: Single<number>;
        pendingActions: Single<boolean>;
        countChangesToNumProductsOutOfStock: Single<number>;
        numUpdates: Single<number>;
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer>({ customerID: [], firstName: [], lastName: [] }),
        orders: CreateTable<Order>({ orderID: [], customerID: [], orderLocation: [], orderDate: [] }),
        company: CreateTable<Company>({ companyID: [1, 2, 3], name: ['abc', 'def', 'ghi'], location: ['CA', 'US', 'EU'] }),
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
};

/*** SETUP TRIGGERS */
s.queues.eventQueue.onInsert(() => {
    s.singles.pendingActions.set(true);
});

s.queues.eventQueue.onGet(() => {
    s.singles.pendingActions.set(false);
});

s.singles.numProductsOutOfStock.onSet(() => {
    const v = singles.countChangesToNumProductsOutOfStock.get();
    singles.countChangesToNumProductsOutOfStock.set(v + 1);
});

s.singles.numProductsOutOfStock.onGet(() => {
    const v = singles.countChangesToNumProductsOutOfStock.get();
    singles.countChangesToNumProductsOutOfStock.set(v + 1);
});

s.tables.customers.onAfterInsert((v) => {
    s.tables.orders.insertRow({ orderID: 100, customerID: v.customerID, orderDate: new Date(), orderLocation: '' });
});

s.tables.customers.onBeforeInsert((v) => {
    if (v.firstName === 'OmitMe') {
        return false;
    }

    if (v.lastName === 'ChangeMe') {
        v.lastName = 'Changed';
        return v;
    }
});

s.tables.customers.onBeforeDelete((v) => {
    if (v.firstName === 'OmitMe') {
        return false;
    }
});

s.tables.customers.onAfterDelete((v) => {
    s.tables.orders.deleteRows({ customerID: v.customerID });
});

s.tables.customers.onAfterUpdate((_, nv) => {
    if (nv.customerID === 10) {
        s.singles.numUpdates.set(s.singles.numUpdates.get() + 1);
    }
});

s.tables.customers.onBeforeUpdate((cv, nv) => {
    if (cv.firstName === 'UpdateMe') {
        nv.firstName = 'Changed before update';
        return nv;
    }
});

/*** EXTRACT AND FREEZE MY STRUCTURES */
const { tables, singles, queues } = extract(s);

describe('Testing Tables', () => {
    it('should increment primary keys when inserting new rows', () => {
        const { result } = renderHook(() => tables.customers.use(null));
        act(() => {
            tables.customers.insertRow({ customerID: 1, firstName: 'Billy', lastName: 'McBilly' });
            tables.customers.insertRow({ customerID: 2, firstName: 'Sally', lastName: 'WrongLastName' });
            tables.customers.insertRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        });
        expect(result.current.length).toBe(3);
        expect(result.current.slice(-1)[0]._pk).toBe(3);
    });

    it('should return all table rows', () => {
        const rows = tables.customers.getRows();
        expect(rows.length).toBe(3);
    });

    it('should return null when row does not exist', () => {
        const { result } = renderHook(() => tables.customers.useRow(-1));
        expect(result.current).toBeUndefined();
    });

    it('should return row when it exists', () => {
        const { result } = renderHook(() => tables.customers.useRow(2));
        expect(result.current?._pk).toBe(2);
        expect(result.current?.firstName).toBe('Sally');
    });

    it('should update the row using the object approach', () => {
        let order = tables.orders.getRow(1);
        if (order) {
            tables.orders.updateRow(order._pk, { orderLocation: 'Canada' });
            order = tables.orders.getRow(order._pk);
            expect(order?.orderLocation).toEqual('Canada');
        } else {
            fail('order could not be found');
        }
    });

    it('should update the row using the function approach', () => {
        let order = tables.orders.getRow(1);
        if (order) {
            tables.orders.updateRow(order._pk, (o) => {
                o.orderLocation = 'Europe';
                return o;
            });
            order = tables.orders.getRow(order._pk);
            expect(order?.orderLocation).toEqual('Europe');
        } else {
            fail('order could not be found');
        }
    });

    it('should update all rows using the object approach without a where clause', () => {
        let orders = tables.orders.getRows();
        expect(orders.length).toEqual(3);
        tables.orders.updateRows({ orderLocation: 'America' });
        orders = tables.orders.getRows({ orderLocation: 'America' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the object approach with an object where clause', () => {
        let orders = tables.orders.getRows();
        expect(orders.length).toEqual(3);
        tables.orders.updateRows({ orderLocation: 'Europe' }, { orderLocation: 'America' });
        orders = tables.orders.getRows({ orderLocation: 'Europe' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the function approach without a where clause', () => {
        let orders = tables.orders.getRows();
        expect(orders.length).toEqual(3);
        tables.orders.updateRows((o) => ({ ...o, orderLocation: 'America' }));
        orders = tables.orders.getRows({ orderLocation: 'America' });
        expect(orders.length).toEqual(3);
    });

    it('should update all rows using the function approach with a function where clause', () => {
        let orders = tables.orders.getRows();
        expect(orders.length).toEqual(3);
        tables.orders.updateRows(
            (o) => ({ ...o, orderLocation: 'Europe' }),
            (o) => o.orderLocation === 'America',
        );
        orders = tables.orders.getRows({ orderLocation: 'Europe' });
        expect(orders.length).toEqual(3);
    });

    it('should return an undefined row when the row is removed', () => {
        const { result } = renderHook(() => tables.customers.useRow(3));
        act(() => {
            tables.customers.deleteRow(3);
        });
        expect(result.current).toBeUndefined();
    });

    it('should insert the new row', () => {
        const customer = tables.customers.insertRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        expect(customer?.firstName).toBe('Tammy');
    });

    it('should be notified of updates when a table row is updated', () => {
        const { result } = renderHook(() => tables.customers.useRow(2));
        act(() => {
            tables.customers.updateRow(2, { lastName: 'McBilly' });
        });
        expect(result.current?.lastName).toBe('McBilly');
    });

    it('should find all table rows when passing a function', () => {
        const { result } = renderHook(() =>
            tables.customers.getRows((v) => {
                return v.firstName === 'Billy' || v.firstName === 'Tammy';
            }),
        );
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Tammy');
    });

    it('should find all table rows when passing an object', () => {
        const { result } = renderHook(() => tables.customers.getRows({ lastName: 'McBilly' }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Sally');
    });

    it('should return an empty array when finding all table rows with non-matching function', () => {
        const { result } = renderHook(() =>
            tables.customers.getRows((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current.length).toBe(0);
    });

    it('should return an empty array when finding all table rows with non-matching object', () => {
        const { result } = renderHook(() => tables.customers.getRows({ firstName: 'Teddy' }));
        expect(result.current.length).toBe(0);
    });

    it('should find the table row when passing the PK', () => {
        const result = tables.customers.getRow(1);
        expect(result?.firstName).toBe('Billy');
    });

    it('should find the first table row when passing a function', () => {
        const { result } = renderHook(() =>
            tables.customers.getRow((v) => {
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
        const result = tables.customers.getRow({ lastName: 'McBilly' });
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result).toBeTruthy();
        expect(result?.firstName).toBe('Billy');
    });

    it('should return undefined when finding a table row with non-matching function', () => {
        const { result } = renderHook(() =>
            tables.customers.getRow((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current).toBeUndefined();
    });

    it('should return undefined when finding a table row with non-matching object', () => {
        const { result } = renderHook(() => tables.customers.getRow({ firstName: 'Teddy' }));
        expect(result.current).toBeUndefined();
    });

    it('should return false when deleting a row that cannot be found', () => {
        const deleted = tables.customers.deleteRow(10);
        expect(deleted).toBe(false);
    });

    it('should return true when deleting a customer using the primary key', () => {
        const c = tables.customers.getRow({ lastName: 'McBilly' });
        const n = tables.customers.getRowCount();
        expect(c).toBeTruthy();
        if (c) {
            const deleted = tables.customers.deleteRow(c._pk);
            const newN = tables.customers.getRowCount();
            expect(deleted).toEqual(true);
            expect(newN).toEqual(n - 1);
            // add the row back in for future tests
            tables.customers.insertRow({ customerID: 1, firstName: 'Billy', lastName: 'McBilly' });
        }
    });

    it('getRows() should return the same number of rows as getRowCount()', () => {
        const n = tables.customers.getRowCount({ lastName: 'McBilly' });
        expect(n).toEqual(2);
        const o = tables.customers.getRows({ lastName: 'McBilly' });
        expect(o.length).toEqual(2);
        const o1 = tables.customers.getRows((v) => v.lastName === 'McBilly');
        expect(o1.length).toEqual(2);
        expect(n).toEqual(o.length);
        expect(n).toEqual(o1.length);
    });

    it('should return 1 when deleting a customer using the object approach', () => {
        const n = tables.customers.getRowCount();
        const num = tables.customers.deleteRows({ lastName: 'McTammy' });
        const newN = tables.customers.getRowCount();
        expect(num).toEqual(1);
        expect(newN).toEqual(n - 1);
        // add the row back in for future tests
        tables.customers.insertRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
    });

    it('should return 1 when deleting a customer using the function approach', () => {
        const n = tables.customers.getRowCount();
        const num = tables.customers.deleteRows((v) => v.lastName === 'McTammy');
        const newN = tables.customers.getRowCount();
        expect(num).toEqual(1);
        expect(newN).toEqual(n - 1);
        // add the row back in for future tests
        tables.customers.insertRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
    });

    it('should delete all rows when the call to deleteTableRows is undefined', () => {
        const n = tables.customers.getRowCount();
        const num = tables.customers.deleteRows();
        const newN = tables.customers.getRowCount();
        expect(num).toEqual(n);
        expect(newN).toEqual(0);
    });

    it('should insert multiple rows when using insertRows', () => {
        tables.orders.insertRows([
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1234 },
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1235 },
            { customerID: 999, orderLocation: 'Canada', orderDate: new Date(), orderID: 1236 },
        ]);
        const n = tables.orders.getRowCount({ customerID: 999 });
        expect(n).toEqual(3);
        tables.orders.deleteRows({ customerID: 999 });
    });
});

describe('Testing TriggerQueue', () => {
    it('should insert an item to the queue', () => {
        queues.eventQueue.insert('openEvent');
        expect(queues.eventQueue.size()).toEqual(1);
    });
    it('should get an item from the queue', () => {
        queues.eventQueue.get();
        expect(queues.eventQueue.size()).toEqual(0);
    });
    it('should return undefined when getting from an empty queue', () => {
        const v = queues.eventQueue.get();
        expect(v).toBeUndefined();
    });
    it('should return 0 when getting size of empty queue', () => {
        const v = queues.eventQueue.size();
        expect(v).toEqual(0);
    });

    test('queue insertItem should trigger to change pendingActions single to "true"', () => {
        singles.pendingActions.set(false);
        let v = singles.pendingActions.get();
        expect(v).toEqual(false);
        queues.eventQueue.insert('testing queue trigger');
        v = singles.pendingActions.get();
        expect(v).toEqual(true);
    });

    test('queue getItem should trigger to change pendingActions single to "false"', () => {
        singles.pendingActions.set(true);
        let v = singles.pendingActions.get();
        expect(v).toEqual(true);
        queues.eventQueue.get();
        v = singles.pendingActions.get();
        expect(v).toEqual(false);
    });
});

describe('Testing Single triggers', () => {
    it('should trigger an increment to countChangesToNumProductsOutOfStock when numProductsOutOfStock is set', () => {
        const ok = singles.numProductsOutOfStock.set(100);
        expect(ok).toEqual(true);
        singles.numProductsOutOfStock.set(200);
        singles.numProductsOutOfStock.set(300);
        const count = singles.countChangesToNumProductsOutOfStock.get();
        expect(count).toEqual(3);
    });

    it('should trigger an increment to countChangesToNumProductsOutOfStock with numProductsOutOfStock onGet', () => {
        singles.countChangesToNumProductsOutOfStock.set(0);
        singles.numProductsOutOfStock.get();
        const count = singles.countChangesToNumProductsOutOfStock.get();
        expect(count).toEqual(1);
    });
});

describe('Testing table triggers', () => {
    it('should add a new row to the "Orders" table', () => {
        const result = tables.customers.insertRow({ customerID: 10, firstName: 'fake', lastName: 'McCustomer' });
        expect(result?.customerID).toBe(10);
        const row = tables.orders.getRow({ customerID: 10 });
        expect(row).toBeTruthy();
        expect(row?.customerID).toEqual(10);
    });
    it('should delete all customer orders from the "Orders" table', () => {
        let n = tables.orders.getRowCount({ customerID: 10 });
        const numDeleted = tables.customers.deleteRows({ customerID: 10 });
        expect(numDeleted).toBeGreaterThan(0);
        expect(numDeleted).toEqual(n);
        n = tables.orders.getRowCount({ customerID: 10 });
        expect(n).toEqual(0);
    });
    it('should trigger for the "numUpdates" to update when updating a customer record', () => {
        const { result } = renderHook(() => singles.numUpdates.use());
        act(() => {
            const c = tables.customers.insertRow({ customerID: 10, firstName: 'fake', lastName: 'McCustomer' });
            expect(c).toBeTruthy();
            if (c) {
                tables.customers.updateRow(c._pk, { firstName: 'NewFakeName' });
                tables.customers.updateRow(c._pk, { firstName: 'NewNewFakeName' });
                tables.customers.updateRow(c._pk, { firstName: 'OldFakeName' });
            }
        });
        expect(result.current).toEqual(3);
    });
    it('should not insert the row based on "onBeforeInsert" trigger', () => {
        const n = tables.customers.getRowCount();
        const c = tables.customers.insertRow({ customerID: 10, firstName: 'OmitMe', lastName: 'McCustomer' });
        expect(c).toEqual(undefined);
        const nv = tables.customers.getRowCount();
        expect(n).toEqual(nv);
    });
    it('should alter the row based on "onBeforeInsert" trigger', () => {
        const n = tables.customers.getRowCount();
        const c = tables.customers.insertRow({ customerID: 10, firstName: 'Happy', lastName: 'ChangeMe' });
        expect(c).toBeTruthy();
        const nv = tables.customers.getRowCount();
        expect(nv).toEqual(n + 1);
        expect(c?.lastName).toEqual('Changed');
    });
    it('should not delete the row based on "onBeforeDelete" trigger', () => {
        const n = tables.customers.getRowCount();
        const c = tables.customers.deleteRow({ firstName: 'OmitMe' });
        expect(c).toEqual(false);
        const nv = tables.customers.getRowCount();
        expect(n).toEqual(nv);
    });
    it('should update the value based on "onBeforeUpdate" trigger', () => {
        const c = tables.customers.insertRow({ customerID: 10, firstName: 'UpdateMe', lastName: 'McCustomer' });
        expect(c).toBeTruthy();
        if (c) {
            const nv = tables.customers.updateRow(c._pk, { firstName: 'Something else' });
            expect(nv).toBeTruthy();
            expect(nv?.firstName).toEqual('Changed before update');
        }
    });
});

describe('Testing table initial values', () => {
    it('should have the proper _pk when initializing with values', () => {
        const { result } = renderHook(() => tables.company.use(null));
        expect(result).toBeTruthy();
        if (result) {
            expect(result.current.length).toBe(3);
            expect(result.current.slice(-1)[0]._pk).toBe(3);
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
            expect(errMessage.message).toBe(`⚡Error in Trigger: invalid initial arguments when creating table; cannot create an empty table`);
        }
    });
    it('should return the proper error message when creating a table with mismatched column lengths', () => {
        try {
            CreateTable({ name: [1, 2, 3], age: [1, 2] });
        } catch (err: unknown) {
            const errMessage = err as Error;
            expect(errMessage.message).toBe(`⚡Error in Trigger: invalid initial arguments when creating table; column "age" has improper length of 2, which does not match the length of the other columns provided`);
        }
    });
});
