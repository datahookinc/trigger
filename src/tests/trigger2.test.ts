import { renderHook, act } from '@testing-library/react';
import CreateStore, { Store, TriggerAPI } from '../trigger/trigger';

type Customer = {
    _pk: number;
    customerID: number;
    firstName: string;
    lastName: string;
}

type Order = {
    _pk: number;
    orderID: number;
    customerID: number;
    orderDate: Date;
    orderLocation: string;
}

type OrderLineItem = {
    _pk: number;
    orderID: number;
    productID: number;
    quantity: number;
}

type Product = {
    _pk: number;
    productID: number;
    description: string;
    price: number;
    availableQuantity: number;
}

type Shipment = {
    _pk: number;
    orderID: number;
    customerID: number;
    hasShipped: boolean;
}

interface MyStore extends Store {
    tables: {
        customers: {
            _pk: Customer["_pk"][];
            customerID: Customer["customerID"][];
            firstName: Customer["firstName"][];
            lastName: Customer["lastName"][];
        };
        orders: {
            _pk: Order["_pk"][];
            orderID: Order["orderID"][];
            customerID: Order["customerID"][];
            orderDate: Order["orderDate"][];
            orderLocation: Order["orderLocation"][];
        };
        orderLineItems: {
            _pk: OrderLineItem["_pk"][];
            orderID: OrderLineItem["orderID"][];
            productID: OrderLineItem["productID"][];
            quantity: OrderLineItem["quantity"][];
        };
        products: {
            _pk: Product["_pk"][];
            productID: Product["productID"][];
            description: Product["description"][];
            price: Product["price"][];
            availableQuantity: Product["availableQuantity"][];
        };
        shipments: {
            _pk: Shipment["_pk"][];
            orderID: Shipment["orderID"][];
            customerID: Shipment["customerID"][];
            hasShipped: Shipment["hasShipped"][];
        };
    };
    triggers: {
        orders: {
            onInsert(api: TriggerAPI, v: Order): void;
        };
    };
    singles: {
        numProductsOutOfStock: number;
    };
    error: '';
}


const store: MyStore = {
    tables: {
        customers: {
            _pk: [],
            customerID: [],
            firstName: [],
            lastName: [],
        },
        orders: {
            _pk: [],
            orderID: [],
            customerID: [],
            orderDate: [],
            orderLocation: [],
        },
        orderLineItems: {
            _pk: [],
            orderID: [],
            productID: [],
            quantity: [],
        },
        products: {
            _pk: [],
            productID: [],
            description: [],
            price: [],
            availableQuantity: [],
        },
        shipments: {
            _pk: [],
            orderID: [],
            customerID: [],
            hasShipped: [],
        }
    },
    triggers: {
        orders: {
            onInsert: (api: TriggerAPI, v: Order) => {
                api.insertTableRow<Shipment>('shipments', { orderID: v.orderID, customerID: v.customerID, hasShipped: false });
            }
        },
        // products: {
        //     onUpdate: (api: TriggerAPI, v: Product) => {
                
        //     }
        // }
    },
    singles: {
        numProductsOutOfStock: 0,
    },
    error: '',
}

const { 
    useTable,
    useTableRow,
    insertTableRow,
    insertTableRows,
    deleteTableRow,
    updateTableRow,
    findTableRow,
    findTableRows,
    clearTable,
    useSingle,
    setSingle,
    getSingle 
} = CreateStore(store);

describe('Testing store', () => {
    it('should increment primary keys when inserting new rows', () => {
        const { result } = renderHook(() => useTable<Customer>('customers', null, []));
        act(() => {
            insertTableRow<Customer>('customers', { customerID: 1, firstName: 'Billy', lastName: 'McBilly'});
            insertTableRow<Customer>('customers', { customerID: 2, firstName: 'Sally', lastName: 'WrongLastName'});
            insertTableRow<Customer>('customers', { customerID: 3, firstName: 'Tammy', lastName: 'McTammy'});
        });
        expect(result.current.length).toBe(3);
        expect(result.current.slice(-1)[0]._pk).toBe(3);
    });
    it('should return null when row does not exist', () => {
        const { result } = renderHook(() => useTableRow<Customer>('customers', -1));
        expect(result.current).toBeNull();
    });

    it('should return row when it exists', () => {
        const { result } = renderHook(() => useTableRow<Customer>('customers', 2));
        expect(result.current?._pk).toBe(2);
        expect(result.current?.firstName).toBe('Sally');
    });

    it('should return a NULL row when the row is removed', () => {
        const { result } = renderHook(() => useTableRow<Customer>('customers', 3));
        act(() => {
            deleteTableRow('customers', 3);
        })
        expect(result.current).toBeNull();
    });

    it('should insert the new row', () => {
        const customer = insertTableRow<Customer>('customers', { customerID: 3, firstName: 'Tammy', lastName: 'McTammy'});
        expect(customer?.firstName).toBe('Tammy');
    });

    it('should be notified of updates when a table row is updated', () => {
        const { result } = renderHook(() => useTableRow<Customer>('customers', 2));
        act(() => {
            updateTableRow<Customer>('customers', 2, { lastName: 'McBilly' });
        });
        expect(result.current?.lastName).toBe('McBilly');
    });

    it('should find all table rows when passing a function', () => {
        const { result } = renderHook(() => findTableRows<Customer>('customers', (v: Customer) => {
            return v.firstName === 'Billy' || v.firstName === 'Tammy';
        }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Tammy');
    })

    it('should find all table rows when passing an object', () => {
        const { result } = renderHook(() => findTableRows<Customer>('customers', { lastName: 'McBilly'}));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Sally');
    })

    it('should return an empty array when finding all table rows with non-matching function', () => {
        const { result } = renderHook(() => findTableRows<Customer>('customers', (v: Customer) => {
            return v.firstName === 'Teddy';
        }));
        expect(result.current.length).toBe(0);
    })

    it('should return an empty array when finding all table rows with non-matching object', () => {
        const { result } = renderHook(() => findTableRows<Customer>('customers', { firstName: 'Teddy'}));
        expect(result.current.length).toBe(0);
    })

    it('should find the first table row when passing a function', () => {
        const { result } = renderHook(() => findTableRow<Customer>('customers', (v: Customer) => {
            return v.firstName === 'Billy' || v.firstName === 'Tammy';
        }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).not.toBeNull()
        expect(result.current!.firstName).toBe('Billy');
    })

    it('should find the first table row when passing an object', () => {
        const { result } = renderHook(() => findTableRow<Customer>('customers', { lastName: 'McBilly'}));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).not.toBeNull()
        expect(result.current!.firstName).toBe('Billy');
    })

    it('should return null when finding a table row with non-matching function', () => {
        const { result } = renderHook(() => findTableRow<Customer>('customers', (v: Customer) => {
            return v.firstName === 'Teddy';
        }));
        expect(result.current).toBeNull();
    })

    it('should return null when finding a table row with non-matching object', () => {
        const { result } = renderHook(() => findTableRow<Customer>('customers', { firstName: 'Teddy'}));
        expect(result.current).toBeNull();
    })


});
