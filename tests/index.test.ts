import { renderHook, act } from '@testing-library/react';
import { extractTables, extractQueues, extractSingles, CreateQueue, CreateSingle, CreateTable } from '../src';
import type { Store, TriggerTable, TriggerQueue, TriggerSingle } from '../src';

type Customer = {
    _pk: number;
    customerID: number;
    firstName: string;
    lastName: string;
};

type Order = {
    _pk: number;
    orderID: number;
    customerID: number;
    orderDate: Date;
    orderLocation: string;
};

interface MyStore extends Store {
    tables: {
        customers: TriggerTable<Customer>;
        orders: TriggerTable<Order>;
    };
    queues: {
        eventQueue: TriggerQueue<string>;
    };
    singles: {
        numProductsOutOfStock: TriggerSingle<number>;
        pendingActions: TriggerSingle<boolean>;
        countChangesToNumProductsOutOfStock: TriggerSingle<number>;
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer>({ _pk: [], customerID: [], firstName: [], lastName: [] }),
        orders: CreateTable<Order>({ _pk: [], orderID: [], customerID: [], orderLocation: [], orderDate: [] }),
    },
    queues: {
        eventQueue: CreateQueue<string>(),
    },
    singles: {
        numProductsOutOfStock: CreateSingle(0),
        pendingActions: CreateSingle(false),
        countChangesToNumProductsOutOfStock: CreateSingle(0),
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

s.tables.customers.onInsert((v) => {
    s.tables.orders.insertTableRow({ orderID: 100, customerID: v.customerID, orderDate: new Date(), orderLocation: '' });
});

/*** FREEZE MY STRUCTURES */
const tables = extractTables(s.tables);
const queues = extractQueues(s.queues);
const singles = extractSingles(s.singles);

describe('Testing Tables', () => {
    it('should increment primary keys when inserting new rows', () => {
        const { result } = renderHook(() => tables.customers.useTable(null));
        act(() => {
            tables.customers.insertTableRow({ customerID: 1, firstName: 'Billy', lastName: 'McBilly' });
            tables.customers.insertTableRow({ customerID: 2, firstName: 'Sally', lastName: 'WrongLastName' });
            tables.customers.insertTableRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        });
        expect(result.current.length).toBe(3);
        expect(result.current.slice(-1)[0]._pk).toBe(3);
    });

    it('should return null when row does not exist', () => {
        const { result } = renderHook(() => tables.customers.useTableRow(-1));
        expect(result.current).toBeUndefined();
    });

    it('should return row when it exists', () => {
        const { result } = renderHook(() => tables.customers.useTableRow(2));
        expect(result.current?._pk).toBe(2);
        expect(result.current?.firstName).toBe('Sally');
    });

    it('should return a NULL row when the row is removed', () => {
        const { result } = renderHook(() => tables.customers.useTableRow(3));
        act(() => {
            tables.customers.deleteTableRow(3);
        });
        expect(result.current).toBeUndefined();
    });

    it('should insert the new row', () => {
        const customer = tables.customers.insertTableRow({ customerID: 3, firstName: 'Tammy', lastName: 'McTammy' });
        expect(customer?.firstName).toBe('Tammy');
    });

    it('should be notified of updates when a table row is updated', () => {
        const { result } = renderHook(() => tables.customers.useTableRow(2));
        act(() => {
            tables.customers.updateTableRow(2, { lastName: 'McBilly' });
        });
        expect(result.current?.lastName).toBe('McBilly');
    });

    it('should find all table rows when passing a function', () => {
        const { result } = renderHook(() =>
            tables.customers.findTableRows((v) => {
                return v.firstName === 'Billy' || v.firstName === 'Tammy';
            }),
        );
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Tammy');
    });
    it('should find all table rows when passing an object', () => {
        const { result } = renderHook(() => tables.customers.findTableRows({ lastName: 'McBilly' }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Sally');
    });
    it('should return an empty array when finding all table rows with non-matching function', () => {
        const { result } = renderHook(() =>
            tables.customers.findTableRows((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current.length).toBe(0);
    });
    it('should return an empty array when finding all table rows with non-matching object', () => {
        const { result } = renderHook(() => tables.customers.findTableRows({ firstName: 'Teddy' }));
        expect(result.current.length).toBe(0);
    });
    it('should find the first table row when passing a function', () => {
        const { result } = renderHook(() =>
            tables.customers.findTableRow((v) => {
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
        const { result } = renderHook(() => tables.customers.findTableRow({ lastName: 'McBilly' }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).toBeTruthy();
        if (result.current) {
            expect(result.current.firstName).toBe('Billy');
        }
    });
    it('should return undefined when finding a table row with non-matching function', () => {
        const { result } = renderHook(() =>
            tables.customers.findTableRow((v) => {
                return v.firstName === 'Teddy';
            }),
        );
        expect(result.current).toBeUndefined();
    });
    it('should return undefined when finding a table row with non-matching object', () => {
        const { result } = renderHook(() => tables.customers.findTableRow({ firstName: 'Teddy' }));
        expect(result.current).toBeUndefined();
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
        const result = tables.customers.insertTableRow({ customerID: 10, firstName: 'fake', lastName: 'McCustomer' });
        expect(result.customerID).toBe(10);
        const row = tables.orders.findTableRow({ customerID: 10 });
        expect(row).toBeTruthy();
        expect(row?.customerID).toEqual(10);
    });
});
