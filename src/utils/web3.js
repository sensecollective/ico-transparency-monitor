import Web3 from 'web3';
import { default as config } from '../config.js';
import { toPromise, formatDate, expectException } from '../utils';

const ProviderEngine = require('web3-provider-engine');
const CacheSubprovider = require('web3-provider-engine/subproviders/cache.js');
const FixtureSubprovider = require('web3-provider-engine/subproviders/fixture.js');
const FilterSubprovider = require('web3-provider-engine/subproviders/filters.js');
const NonceSubprovider = require('web3-provider-engine/subproviders/nonce-tracker.js');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js');

const engineWithProviders = (providers) => {
  const engine = new ProviderEngine();
  providers.forEach(provider => (provider !== null ? engine.addProvider(provider) : engine));
  return engine;
};


// TODO: Find another solution
export const isConnected = () => {
  const web3 = new Web3();
  web3.setProvider(new web3.providers.HttpProvider(config.rpcHost));
  return web3.isConnected();
};

export const createEngine = rpcUrl =>
    engineWithProviders([
      new FixtureSubprovider({
        web3_clientVersion: 'ProviderEngine/v0.0.0/javascript',
        net_listening: true,
        eth_hashrate: '0x00',
        eth_mining: false,
        eth_syncing: true,
      }),
      new CacheSubprovider(),
      new FilterSubprovider(),
      new NonceSubprovider(),
      new RpcSubprovider({ rpcUrl }),
    ]);


export const web3Connect = () => {
  const engine = createEngine(config.rpcHost);

  window.web3 = new Web3(engine);

  engine.start();
  console.log(`${config.rpcHost} new connection`);
  return window.web3;
};

export const web3Connection = () => async (dispatch, getState) => {
  if (isConnected() === false) {
    await dispatch({ type: 'SHOW_MODAL_ERROR', message: 'WEB3_CONNECTION_FAIL', web3: null });
    return;
  }

  const web3 = web3Connect();
  await dispatch({ type: 'SET_WEB3_CONNECTION', web3 });
};

export const getSmartContract = (web3, address) => {
  if (!web3) { return null; }

  const abi = require(`../smart_contracts/${address}.json`);
  return web3.eth.contract(abi).at(address);
};

export const getWeb3 = () => {
  if (isConnected() === false) { throw Error('SHOW_MODAL_ERROR'); }

  if (typeof window !== 'undefined' && window.web3 !== undefined) { return window.web3; }

  return web3Connect();
};


const getSmartContractDirectParameters = async (smartContract) => {
  const name = smartContract.name ? await toPromise(smartContract.name)() : null;
  const totalSupply = smartContract.totalSupply ? await toPromise(smartContract.totalSupply)() : null;
  const symbol = smartContract.symbol ? await toPromise(smartContract.symbol)() : null;
  const decimals = smartContract.decimals ? await toPromise(smartContract.decimals)() : config.defaultDecimal;

  return {
    name,
    totalSupply: totalSupply / 10 ** decimals,
    symbol,
    decimals,
  };
};

export const getSmartContractConstants = async (web3, address) => {
  let parameterAddress = address;

  if (typeof config.ICOs[address].tokenContract !== 'undefined') { parameterAddress = config.ICOs[address].tokenContract; }

  const smartContract = getSmartContract(web3, parameterAddress);
  const result = await getSmartContractDirectParameters(smartContract);

  const constants = config.ICOs[address].icoParameters; // constants from the config


  Object.keys(constants).forEach((constant) => {
    if (constants[constant] === null) return;
    result[constant] = constants[constant](smartContract);
  });

  result.decimals = typeof smartContract.decimals !== 'undefined' ? await toPromise(smartContract.decimals)() : config.defaultDecimal;

  return result;
};

export const constantValueOf = (constant, type) => async (web3) => {
  switch (type) {
    case 'string' :return constant;
    case 'uint256' :return web3.fromWei(constant, 'ether').valueOf();
    case 'timestamp' :return formatDate(new Date(parseInt(constant.valueOf()) * 1000), false);
    case 'blockNumber':
      const timestamp = (await toPromise(web3.eth.getBlock)(constant.valueOf())).timestamp;
      return formatDate(new Date(parseInt(timestamp) * 1000), false);
    default: return null;
  }
};
