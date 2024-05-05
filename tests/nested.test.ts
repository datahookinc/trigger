import { renderHook, act } from '@testing-library/react';
import { extract, CreateTable, type Store, type Table } from '../src';
import 'isomorphic-fetch'; // required because jest does not recognize node's global fetch API (even though it should when using node v18)

type Customer = {
    customerID: number;
    firstName: string;
    lastName: string;
    orders: Order[];
    lastOrder: null | Order;
};

type Order = {
    orderID: number;
    customerID: Customer['customerID'];
    orderDate: Date;
    orderLocation: string;
};

interface MyStore extends Store {
    tables: {
        customers: Table<Customer>; // TableRow<Customer>' is not assignable to type 'TableRow<UserRow<any>>; 'TableRow<Customer>' is not assignable to type '{ [x: string]: UserRow<any>
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer>(['customerID', 'firstName', 'lastName', 'orders', 'lastOrder']),
        // orders: CreateTable<Order>(['orderID', 'customerID', 'orderLocation', 'orderDate']),
        // company: CreateTable<Company>({ companyID: [1, 2, 3], name: ['abc', 'def', 'ghi'], location: ['CA', 'US', 'EU'] }),
        // cat: CreateTable<Cat>(['name', 'age']),
    }
};

/*** EXTRACT AND FREEZE MY STRUCTURES */
const { tables } = extract(s);

describe('Testing Tables', () => {
    it('should increment autoID when inserting new rows', () => {
        const { result } = renderHook(() => tables.customers.use());
        act(() => {
            tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly', orders: [{ orderID: 1, customerID: 1, orderDate: new Date(), orderLocation: 'Canada' }], lastOrder: { orderID: 0, customerID: 1, orderDate: new Date(), orderLocation: 'AUS' } });
        });
        expect(result.current.length).toBe(1);
        expect(result.current.slice(-1)[0]._id).toBe(1);
    });

    it('should return all table rows', () => {
        const rows = tables.customers.find();
        expect(rows.length).toBe(1);
    });

    it('should not mutate the underlying object', () => {
        let rows = tables.customers.find();
        rows[0].orders[0].orderLocation = 'America';
        rows = tables.customers.find();
        expect(rows[0].orders[0].orderLocation).toBe('Canada');
    });

    it('should not mutate the underlying object when getting by index', () => {
        let row = tables.customers.findById(1);
        if (!row) {
            throw new Error('row is undefined');
        }
        row.orders[0].orderLocation = 'America';
        row = tables.customers.findById(1);
        if (!row) {
            throw new Error('row is undefined');
        }
        expect(row.orders[0].orderLocation).toBe('Canada');
    });

    it('should clone objects when inserting', () => {
        const { result } = renderHook(() => tables.customers.use());
        const order = { orderID: 1, customerID: 1, orderDate: new Date(), orderLocation: 'UK' }
        act(() => {
            tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly', orders: [order], lastOrder: { orderID: 10, customerID: 1, orderDate: new Date(), orderLocation: 'CHN' } });
        });
        order.orderLocation = 'America';
        expect(result.current.length).toBe(2);
        const lastRow = result.current.slice(-1)[0];
        expect(lastRow.orders[0].orderLocation).toBe('UK');
        if (!lastRow.lastOrder) {
            throw new Error('last order is null');
        }
        expect(lastRow.lastOrder.orderLocation).toBe('CHN');
    });

    it('should update the last order', () => {
        const { result } = renderHook(() => tables.customers.use());
        act(() => {
            tables.customers.updateMany(v => {
                if (v.lastOrder != null) {
                    v.lastOrder.orderLocation = 'BRZ';
                }
                return v;
            })
        });
        expect(result.current.length).toBe(2);
        const lastRow = result.current.slice(-1)[0];
        if (!lastRow.lastOrder) {
            throw new Error('last order is null');
        }
        expect(lastRow.lastOrder.orderLocation).toBe('BRZ');
    });
});