export interface Item {
  country_of_origin: string | null;
  created_at: string;
  id: number;
  item_price: number;
  member_price: number | null;
  organic: boolean;
  q: string | null;
  store_uuid: number;
  title: string;
  unit: string;
  unit_price: number;
}

export type CleanedItem = {
  marks: string;
  storeName: string;
  itemPrice: string;
  unitPrice: string;
  title: string;
};

export interface Store {
  chain: string | null;
  chain_store_id: string | null;
  name: string | null;
  uuid: number;
}
