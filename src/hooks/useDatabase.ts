import { useEffect, useState } from 'react';
import { database } from '@database/index';
import type { Model, Query } from '@nozbe/watermelondb';

/**
 * Hook to observe a WatermelonDB query
 * Automatically updates when data changes
 */
export function useDatabase<T extends Model>(
  query: Query<T>
): T[] | undefined {
  const [records, setRecords] = useState<T[] | undefined>(undefined);

  useEffect(() => {
    const subscription = query.observe().subscribe((data) => {
      setRecords(data);
    });

    return () => subscription.unsubscribe();
  }, [query]);

  return records;
}

/**
 * Hook to observe a single record by ID
 */
export function useDatabaseRecord<T extends Model>(
  tableName: string,
  recordId: string | undefined
): T | null {
  const [record, setRecord] = useState<T | null>(null);

  useEffect(() => {
    if (!recordId) {
      setRecord(null);
      return;
    }

    const fetchRecord = async () => {
      try {
        const collection = database.get<T>(tableName);
        const found = await collection.find(recordId);
        setRecord(found);
      } catch (error) {
        console.error(`Error fetching record ${recordId}:`, error);
        setRecord(null);
      }
    };

    fetchRecord();
  }, [tableName, recordId]);

  return record;
}

/**
 * Hook to get a database collection
 */
export function useCollection<T extends Model>(tableName: string) {
  return database.get<T>(tableName);
}

/**
 * Hook to create a new record
 */
export function useCreateRecord<T extends Model>(tableName: string) {
  return async (data: Partial<T>) => {
    try {
      const collection = database.get<T>(tableName);
      const record = await database.write(async () => {
        return await collection.create((record: any) => {
          Object.assign(record, data);
        });
      });
      return { success: true, record };
    } catch (error) {
      console.error(`Error creating record in ${tableName}:`, error);
      return { success: false, error };
    }
  };
}

/**
 * Hook to update a record
 */
export function useUpdateRecord<T extends Model>() {
  return async (record: T, updates: Partial<T>) => {
    try {
      await database.write(async () => {
        await record.update((r: any) => {
          Object.assign(r, updates);
        });
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating record:', error);
      return { success: false, error };
    }
  };
}

/**
 * Hook to delete a record (soft delete)
 */
export function useDeleteRecord<T extends Model>() {
  return async (record: T & { deletedAt?: Date }) => {
    try {
      await database.write(async () => {
        await record.update((r: any) => {
          r.deletedAt = new Date();
        });
      });
      return { success: true };
    } catch (error) {
      console.error('Error deleting record:', error);
      return { success: false, error };
    }
  };
}

/**
 * Hook to permanently delete a record
 */
export function usePermanentDeleteRecord<T extends Model>() {
  return async (record: T) => {
    try {
      await database.write(async () => {
        await record.destroyPermanently();
      });
      return { success: true };
    } catch (error) {
      console.error('Error permanently deleting record:', error);
      return { success: false, error };
    }
  };
}
