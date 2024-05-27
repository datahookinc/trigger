import { renderHook, act } from '@testing-library/react';
import { extract, CreateTable, type Store, type Table } from '../src';
import 'isomorphic-fetch'; // required because jest does not recognize node's global fetch API (even though it should when using node v18)

type CustomerBase = {
    customerID: number;
    firstName: string;
    lastName: string;
    type: 'active' | 'inactive';
    isCool: boolean;
    orders: Order[];
    other: {
        lastOrderDate: Date;
        email: string;
    } | null;
}

type ActiveCustomer = CustomerBase & {
    type: 'active';
    lastContactDate: Date;
}

type InActiveCustomer = CustomerBase & {
    type: 'inactive';
    cancellationDate: Date;
}

type Customer = ActiveCustomer | InActiveCustomer;

type OrderBase = {
    status: 'inprogress' | 'complete';
    orderID: number;
    customerID: Customer['customerID'];
    orderDate: Date;
    orderLocation: string;
}

type OrderInProgress = OrderBase & {
    status: 'inprogress';
    lastUpdate: Date;
}

type OrderComplete = OrderBase & {
    status: 'complete';
    completionDate: Date;
}

type Order = OrderInProgress | OrderComplete;

interface MyStore extends Store {
    tables: {
        customers: Table<ActiveCustomer>; // TableRow<Customer>' is not assignable to type 'TableRow<UserRow<any>>; 'TableRow<Customer>' is not assignable to type '{ [x: string]: UserRow<any>
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<ActiveCustomer>(['customerID', 'firstName', 'lastName', 'orders', 'type', 'isCool', 'other', 'lastContactDate']),
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
            tables.customers.insertOne({ customerID: 1, type: 'active', firstName: 'Billy', lastName: 'McBilly', orders: [{ status: 'inprogress', orderID: 1, customerID: 1, orderDate: new Date(), orderLocation: 'Canada', lastUpdate: new Date() }], isCool: true, other: null, lastContactDate: new Date() });
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
        const order: Order = { orderID: 1, status: 'inprogress', customerID: 1, orderDate: new Date(), orderLocation: 'UK', lastUpdate: new Date() }
        act(() => {
            tables.customers.insertOne({ customerID: 1, type: 'active', firstName: 'Billy', lastName: 'McBilly', orders: [order], other: { lastOrderDate: new Date(), email: 'super@mccool.ca' }, isCool: true, lastContactDate: new Date() });
        });
        order.orderLocation = 'America';
        expect(result.current.length).toBe(2);
        const lastRow = result.current.slice(-1)[0];
        expect(lastRow.orders[0].orderLocation).toBe('UK');
        if (!lastRow.other) {
            throw new Error('other is null');
        }
        expect(lastRow.other.email).toBe('super@mccool.ca');
    });

    it('should update the last order', () => {
        const { result } = renderHook(() => tables.customers.use());
        act(() => {
            tables.customers.updateMany(v => {
                if (v.orders.length > 0) {
                    v.orders[v.orders.length - 1].orderLocation = 'BRZ';

                }
                return v;
            })
        });
        expect(result.current.length).toBe(2);
        const lastRow = result.current.slice(-1)[0];
        expect(lastRow.orders.length).toBeGreaterThan(0);
        expect(lastRow.orders[lastRow.orders.length - 1].orderLocation).toBe('BRZ')
    });
});