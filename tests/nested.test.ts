import { renderHook, act, waitFor } from '@testing-library/react';
import { extract, CreateQueue, CreateSingle, CreateTable, type Store, type Table, type Queue, type Single } from '../src';
import 'isomorphic-fetch'; // required because jest does not recognize node's global fetch API (even though it should when using node v18)

type Customer = {
    customerID: number;
    firstName: string;
    lastName: string;
    orders: Order[];
};

type Order = {
    orderID: number;
    customerID: Customer['customerID'];
    orderDate: Date;
    orderLocation: string;
};

// type Company = {
//     companyID: number;
//     name: string;
//     location: string;
// }

// type Cat = {
//     name: string;
//     age: number;
// }

interface MyStore extends Store {
    tables: {
        customers: Table<Customer>; // TableRow<Customer>' is not assignable to type 'TableRow<UserRow<any>>; 'TableRow<Customer>' is not assignable to type '{ [x: string]: UserRow<any>
        // orders: Table<Order>;
        // company: Table<Company>;
        // cat: Table<Cat>;
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer>(['customerID', 'firstName', 'lastName', 'orders']),
        // orders: CreateTable<Order>(['orderID', 'customerID', 'orderLocation', 'orderDate']),
        // company: CreateTable<Company>({ companyID: [1, 2, 3], name: ['abc', 'def', 'ghi'], location: ['CA', 'US', 'EU'] }),
        // cat: CreateTable<Cat>(['name', 'age']),
    }
};

/*** EXTRACT AND FREEZE MY STRUCTURES */
const { tables, singles, queues } = extract(s);

describe('Testing Tables', () => {
    it('should increment autoID when inserting new rows', () => {
        const { result } = renderHook(() => tables.customers.use());
        act(() => {
            tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly', orders: [{ orderID: 1, customerID: 1, orderDate: new Date(), orderLocation: 'Canada' }] });
            tables.customers.insertOne({ customerID: 1, firstName: 'Billy', lastName: 'McBilly', orders: [{ orderID: 1, customerID: 1, orderDate: new Date(), orderLocation: 'Canada' }] });
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
});