export type TriggerQueueItem<T> = {
    item: T;
    cb?: ((ok: boolean) => void);
}

interface ITriggerQueue<T> {
    add(item: T, cb?: ((ok: boolean) => void)): void;
    remove(): TriggerQueueItem<T> | undefined; // when remove is called your calling code can pass a callback function to action
    size(): number;
}

export class TriggerQueue<T> implements ITriggerQueue<T> {
    protected list: TriggerQueueItem<T>[] = new Array<TriggerQueueItem<T>>();
    
    add(item: T, cb?: ((ok: boolean) => void)): void {
        this.list.push({ item, cb });
    }

    remove(): TriggerQueueItem<T> | undefined {
        return this.list.shift();
    }

    size(): number {
        return this.list.length;
    }
}