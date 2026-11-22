import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_purchases.sql',import.meta.url),'utf8'));
  function prepare(sql){
    const statement={
      args:[],bind(...args){this.args=args;return this;},
      async first(){return db.prepare(sql).get(...this.args)||null;},
      async all(){return {results:db.prepare(sql).all(...this.args)};},
      async run(){const r=db.prepare(sql).run(...this.args);return {meta:{changes:Number(r.changes)}};},
      execute(){const s=db.prepare(sql);if(s.columns().length)return {results:s.all(...this.args)};const r=s.run(...this.args);return {results:[],meta:{changes:Number(r.changes)}};}
    };return statement;
  }
  return {raw:db,prepare,async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},withSession(){return this;}};
}
export async function fixture(){
  const DB=database(),env={DB,SITE_ORIGIN:'https://valora-test.example',PAYMENTS_MODE:'test',PURCHASES_ENABLED:'true',STRIPE_ACCOUNT_ID:'acct_valora',
    STRIPE_SECRET_KEY:'sk_test_fixture_not_real',PLUS_PRICE_ID:'price_plus',PLUS_PRODUCT_ID:'prod_plus',THEME_PRICE_ID:'price_theme',THEME_PRODUCT_ID:'prod_theme',PLUS_DELIVERY_CODE:'654321',THEME_DELIVERY_CODE:'123456'};
  await DB.prepare(`INSERT INTO orders(id,sku,request_id,stripe_account,mode,price_id,product_id,amount,currency,session_id,created_at,updated_at)
    VALUES('order','plus','request','acct_valora','test','price_plus','prod_plus',1000,'usd','cs_test_1',1,1)`).run();
  const order=await DB.prepare('SELECT * FROM orders WHERE id=?').bind('order').first();
  const session={id:'cs_test_1',object:'checkout.session',mode:'payment',livemode:false,client_reference_id:'order',
    metadata:{order_id:'order',sku:'plus'},currency:'usd',amount_total:1000,amount_subtotal:1000,
    payment_status:'paid',status:'complete',payment_intent:'pi_1',total_details:{amount_tax:0,amount_discount:0}};
  const price={id:'price_plus',product:'prod_plus',unit_amount:1000,currency:'usd',type:'one_time',active:true,billing_scheme:'per_unit',livemode:false};
  const lines=[{quantity:1,price}];
  const intent={id:'pi_1',object:'payment_intent',livemode:false,status:'succeeded',amount:1000,currency:'usd',latest_charge:'ch_1',metadata:{...session.metadata}};
  const state={refunds:[],disputes:[],calls:0,session,intent};
  const stripe={accounts:{retrieve:async()=>({id:'acct_valora'})},prices:{retrieve:async()=>price},
    checkout:{sessions:{retrieve:async()=>{state.calls++;return state.session;},listLineItems:async()=>({data:lines,has_more:false})}},
    paymentIntents:{retrieve:async()=>state.intent},refunds:{list:async()=>({data:state.refunds,has_more:false})},
    disputes:{list:async()=>({data:state.disputes,has_more:false})},charges:{retrieve:async()=>({payment_intent:'pi_1'})}};
  const event=(id='evt_1',type='checkout.session.completed',object=session)=>({id,type,livemode:false,data:{object}});
  return {env,DB,order,session,price,lines,intent,state,stripe,event};
}
