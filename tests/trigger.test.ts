import { renderHook, act } from '@testing-library/react';
import type { TriggerAPI, TriggerQueue, TriggerQueueItem } from '../src/trigger';
import CreateStore, { NewTriggerQueue, CreateUtils } from '../src/trigger';

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

interface MyStore {
    tables: {
        customers: {
            _pk: Customer["_pk"][];
            customerID: Customer["customerID"][];
            firstName: Customer["firstName"][];
            lastName: Customer["lastName"][];
        }
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
    singles: {
        numProductsOutOfStock: number;
        pendingActions: boolean;
        countChangesToNumProductsOutOfStock: number;
    };
    queues: {
        eventQueue: TriggerQueue<string>;
    };
    triggers: {
        tables: {
            orders: {
                onInsert(api: TriggerAPI, v: Order): void;
            };
        },
        queues: {
            eventQueue: {
                onInsert(api: TriggerAPI, v: string): void;
                onGet(api: TriggerAPI, v: TriggerQueueItem<string>): void;
            }
        },
        singles: {
            numProductsOutOfStock: {
                onSet(api: TriggerAPI, v: number): void;
                onGet(api: TriggerAPI, v: number): void;
            }
        },
    };
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
    singles: {
        numProductsOutOfStock: 0,
        pendingActions: false,
        countChangesToNumProductsOutOfStock: 0,
    },
    queues: {
        eventQueue: NewTriggerQueue<string>(),
    },
    triggers: {
        tables: {
            orders: {
                onInsert: (api: TriggerAPI, v: Order) => {
                    api.insertTableRow<Shipment>('shipments', { orderID: v.orderID, customerID: v.customerID, hasShipped: false });
                }
            },
        },
        queues: {
            eventQueue: {
                onInsert: (api: TriggerAPI) => api.setSingle('pendingActions', true),
                onGet: (api: TriggerAPI) => api.setSingle('pendingActions', false),
            },
        },
        singles: {
            numProductsOutOfStock: {
                onSet: (api: TriggerAPI) => {
                    const v = api.getSingle<number>('countChangesToNumProductsOutOfStock');
                    if (v !== undefined) {
                        api.setSingle('countChangesToNumProductsOutOfStock', v + 1);
                    }
                },
                onGet: (api: TriggerAPI) => {
                    const v = api.getSingle<number>('countChangesToNumProductsOutOfStock');
                    if (v !== undefined) {
                        api.setSingle('countChangesToNumProductsOutOfStock', v + 1);
                    }
                },
            },
        }
    },
}

/* Now we can reference our queues, tables, and singles throughout our codebase */
type QueueNames = Extract<keyof MyStore['queues'], string>
type TableNames = Extract<keyof MyStore['tables'], string>
type SingleNames = Extract<keyof MyStore['singles'], string>

type MyUtils = {
    tables: {[index in TableNames]: TableNames},  
    singles: {[index in SingleNames]: SingleNames},  
    queues: {[index in QueueNames]: QueueNames},
}

export const utils = CreateUtils<MyUtils>(store);

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
    getSingle,
    getQueueItem,
    getQueueSize,
    insertQueueItem,
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
        expect(result.current).toBeUndefined();
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
        expect(result.current).toBeUndefined();
    });

    it('should insert the new row', () => {
        const customer = insertTableRow<Customer>('customers', { customerID: 3, firstName: 'Tammy', lastName: 'McTammy'});
        expect(customer?.firstName).toBe('Tammy');
    });

    it('should be notified of updates when a table row is updated', () => {
        const { result } = renderHook(() => useTableRow<Customer>(utils.tables.customers, 2));
        act(() => {
            updateTableRow<Customer>('customers', 2, { lastName: 'McBilly' });
        });
        expect(result.current?.lastName).toBe('McBilly');
    });

    it('should find all table rows when passing a function', () => {
        const { result } = renderHook(() => findTableRows<Customer>(utils.tables.customers, (v: Customer) => {
            return v.firstName === 'Billy' || v.firstName === 'Tammy';
        }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Tammy');
    })

    it('should find all table rows when passing an object', () => {
        const { result } = renderHook(() => findTableRows<Customer>(utils.tables.customers, { lastName: 'McBilly'}));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current.length).toBe(2);
        expect(result.current[0].firstName).toBe('Billy');
        expect(result.current[1].firstName).toBe('Sally');
    })

    it('should return an empty array when finding all table rows with non-matching function', () => {
        const { result } = renderHook(() => findTableRows<Customer>(utils.tables.customers, (v: Customer) => {
            return v.firstName === 'Teddy';
        }));
        expect(result.current.length).toBe(0);
    })

    it('should return an empty array when finding all table rows with non-matching object', () => {
        const { result } = renderHook(() => findTableRows<Customer>(utils.tables.customers, { firstName: 'Teddy'}));
        expect(result.current.length).toBe(0);
    })

    it('should find the first table row when passing a function', () => {
        const { result } = renderHook(() => findTableRow<Customer>(utils.tables.customers, (v: Customer) => {
            return v.firstName === 'Billy' || v.firstName === 'Tammy';
        }));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).toBeTruthy()
        expect(result.current!.firstName).toBe('Billy');
    })

    it('should find the first table row when passing an object', () => {
        const { result } = renderHook(() => findTableRow<Customer>(utils.tables.customers, { lastName: 'McBilly'}));
        // Note: it is unwise to rely on the rows being returned in a particular order
        expect(result.current).toBeTruthy()
        expect(result.current!.firstName).toBe('Billy');
    })

    it('should return null when finding a table row with non-matching function', () => {
        const { result } = renderHook(() => findTableRow<Customer>(utils.tables.customers, (v: Customer) => {
            return v.firstName === 'Teddy';
        }));
        expect(result.current).toBeUndefined();
    })

    it('should return null when finding a table row with non-matching object', () => {
        const { result } = renderHook(() => findTableRow<Customer>(utils.tables.customers, { firstName: 'Teddy'}));
        expect(result.current).toBeUndefined();
    })
});

describe('Testing TriggerQueue', () => {
    it('should insert an item to the queue', () => {
        insertQueueItem<string>(utils.queues.eventQueue, 'openEvent');
        expect(getQueueSize(utils.queues.eventQueue)).toEqual(1);
    });

    it('should get an item from the queue', () => {
        getQueueItem<string>(utils.queues.eventQueue);
        expect(getQueueSize(utils.queues.eventQueue)).toEqual(0);
    });

    it('should return undefined when getting from an empty queue', () => {
        const v = getQueueItem<string>(utils.queues.eventQueue);
        expect(v).toBeUndefined();
    });

    it('should return false when inserting into an unknown queue', () => {
        const v = insertQueueItem<string>('some fake queue', 'some item');
        expect(v).toEqual(false);
    });

    it('should return undefined when getting from an unknown queue', () => {
        const v = getQueueItem<string>('some fake queue');
        expect(v).toBeUndefined();
    });

    it('should return -1 when getting size of unknown queue', () => {
        const v = getQueueSize('some fake queue');
        expect(v).toEqual(-1);
    });

    it('should return 0 when getting size of empty queue', () => {
        const v = getQueueSize(utils.queues.eventQueue);
        expect(v).toEqual(0);
    });

    it('should trigger to change pendingActions single to "true"', () => {
        setSingle(utils.singles.pendingActions, false);
        let v = getSingle(utils.singles.pendingActions);
        expect(v).toEqual(false);
        insertQueueItem<string>(utils.queues.eventQueue, 'testing queue trigger');
        v = getSingle<boolean>(utils.singles.pendingActions);
        expect(v).toEqual(true);
    });

    test('queue insertItem should trigger to change pendingActions single to "true"', () => {
        setSingle(utils.singles.pendingActions, false);
        let v = getSingle(utils.singles.pendingActions);
        expect(v).toEqual(false);
        insertQueueItem<string>(utils.queues.eventQueue, 'testing queue trigger');
        v = getSingle<boolean>(utils.singles.pendingActions);
        expect(v).toEqual(true);
    });

    test('queue getItem should trigger to change pendingActions single to "false"', () => {
        setSingle(utils.singles.pendingActions, true);
        let v = getSingle(utils.singles.pendingActions);
        expect(v).toEqual(true);
        getQueueItem<string>(utils.queues.eventQueue);
        v = getSingle<boolean>(utils.singles.pendingActions);
        expect(v).toEqual(false);
    });

});

describe('Testing Single triggers', () => {
    it('should trigger an increment to countChangesToNumProductsOutOfStock when numProductsOutOfStock is set', () => {
        const ok = setSingle(utils.singles.numProductsOutOfStock, 100);
        expect(ok).toEqual(true);
        setSingle(utils.singles.numProductsOutOfStock, 200);
        setSingle(utils.singles.numProductsOutOfStock, 300);
        const count = getSingle<number>(utils.singles.countChangesToNumProductsOutOfStock);
        expect(count).toEqual(3);
    });

    it('should trigger an increment to countChangesToNumProductsOutOfStock with numProductsOutOfStock onGet', () => {
        setSingle(utils.singles.countChangesToNumProductsOutOfStock, 0);
        getSingle(utils.singles.numProductsOutOfStock);
        const count = getSingle<number>(utils.singles.countChangesToNumProductsOutOfStock);
        expect(count).toEqual(1);
    });
});