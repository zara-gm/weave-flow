import React, { Component, Text, useEffect  } from 'react';

import { CompactTable } from '@table-library/react-table-library/compact';
import { getTheme } from '@table-library/react-table-library/baseline';

import './App.css';
import WeaveHelper from "./weaveapi/helper";
import { sideChain, authChain, organization, data_table, data_collection } from './Config'
import { FilterOp } from "./weaveapi/filter";
import { ZKOptions } from "./weaveapi/options";

const Buffer = require("buffer").Buffer

const DEFAULT_COLUMNS_COUNT = 13;

class App extends Component {

    constructor(props) {
        super(props);

        const storedKeys = localStorage.getItem("keys");
        const hasKeys = storedKeys != null && storedKeys.split(" ").length === 2;
        const keys = hasKeys ? storedKeys.split(" ") : WeaveHelper.generateKeys();
        let publicKey = keys[0];
        let privateKey = keys[1];
        if (!hasKeys) {
            localStorage.setItem("keys", publicKey + " " + privateKey);
        }
        //console.log(publicKey);

        const wallet = localStorage.getItem("wallet");
        const credentials = localStorage.getItem("credentials") ? JSON.parse(localStorage.getItem("credentials")) : null;

        this.state = {
            wallet: wallet,
            publicKey: publicKey,
            privateKey: privateKey,
            credentials: credentials,
            pageLoadMs: window.performance.timing.navigationStart,
            columns: null,
            data: null,
            averageAge: null,
            dataProof: null
        };
    }

    async getWallet() {
        const accounts = await window.ethereum.request({method: 'eth_requestAccounts'});
        return accounts[0];
    }

    async connect() {
        const pub = this.state.publicKey;
        const pvk = this.state.privateKey;

        const permissions = await ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{
                eth_accounts: {},
            }]
        });
        this.setState({ wallet: await this.getWallet() });
        localStorage.setItem("wallet", this.state.wallet);

        //This message must match what's hashed on server side, changing it here should trigger changing it also in the node
        let msg = "Please sign this message to confirm you own this wallet\nThere will be no blockchain transaction or any gas fees." +
            "\n\nWallet: " + this.state.wallet +
            "\nKey: " + pub;

        const sig = await ethereum.request({
            method: 'personal_sign',
            params: [ this.state.wallet, msg ]
        });

        const credentials = {
            "account": authChain + ":" + this.state.wallet,
            "sig": sig,
            "template": "*",
            "role": "*"
        }

        localStorage.setItem("credentials", JSON.stringify(credentials));
        this.setState({
            publicKey: pub,
            privateKey: pvk,
            credentials: credentials,
        });
    }

    async login() {
        const pub = this.state.publicKey;
        const pvk = this.state.privateKey;

        const nodeApi = new WeaveHelper.WeaveAPI().create(WeaveHelper.getConfig(sideChain, pub, pvk));
        await nodeApi.init();
        console.log(nodeApi)
        const pong = await nodeApi.ping();
        console.log(pong)

        const session = await nodeApi.login(organization, pub, data_collection, this.state.credentials);
        console.log(session)
        console.log(session.scopes.length > 0)
        return { nodeApi, session };
    }


    async write() {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. define record (simple list, as we know the fixed table structure)
        const items = [
            [
                null,               //id, filled server side
                "nickname",         // name_nickname
                "lastname",         // name_last
                "firstname",        // name_first
                "kishore@email.com",  // email
                "+123456789",       // phone - erasure applied at read
                "USA",              // address_country
                "San Francisco",    // address_city - erasure applied at read
                "https://linkedin.com/in/test", //  linkedin_url
                "name#1234",        // discord_username
                "@test",            // telegram username
                "0x1234",           // wallet
                "1990-01-01",       // birthday, YYYY-MM-DD format - erasure applied at read
            ]
        ];

        //3. write
        const records = new WeaveHelper.Records(data_table, items);
        const res = await nodeApi.write(session, data_collection, records, WeaveHelper.Options.WRITE_DEFAULT)
        console.log("Write result")
        console.log(res)
    }

    async compute() {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. MPC
        const algo = "mean";
        const fields = [ "birthday" ];
        const filter = new WeaveHelper.Filter(null, { "id": "ASC" }, null, null);
        const res = await nodeApi.mpc(session, data_collection, data_table, algo, fields, filter, WeaveHelper.Options.MPC_DEFAULT_NO_CHAIN)
        console.log("MPC result")
        console.log(res)

        const avgDate = new Date(res.data * 1);
        const diff = new Date() - avgDate;
        const days = diff / (24 * 3600 * 1000)
        const years = days / 365.25 //new Date(diff).getFullYear() - 1970;
        console.log("Average age", years)

        this.setState({
            averageAge: years
        });
    }

    async read() {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. read
        //const filter = new WeaveHelper.Filter(null, { "id": "ASC" }, null, null);
        const filter = new WeaveHelper.Filter(null, { "id": "ASC" }, null, [ "email" ]); //collapses based on same Email, getting the latest entry

        //change to WeaveHelper.Options.READ_DEFAULT to check hashes against blockchain (we store hashes on polygon testnet)
        // however, that check will fail if the DB is manually tampered with or the polygon testnet is overloaded.
        // best to keep READ_DEFAULT_NO_CHAIN to have the directory app functioning robustly when people input data
        const options = WeaveHelper.Options.READ_DEFAULT_NO_CHAIN;
        // function to get the hashes stored in the smart contract
        // The
        const h = await nodeApi.hashes(session, data_collection, data_table, filter, options)
        console.log("Hashes")
        console.log(h)

        const res = await nodeApi.read(session, data_collection, data_table, filter, options)
        console.log("Read result")
        console.log(res)

        const data = res.data;
        //console.log(data)

        //3. get the table layout
        const reply = await nodeApi.getTableDefinition(session, data_collection, data_table);
        const def = JSON.parse(reply.data)
        //console.log(def);
        const layout = def.layout;
        console.log("Table layout")
        console.log(layout);

        const columns = layout.columnNames.map((i) => { return { label: i, renderCell: (item) => item[i] }; });
        this.setState({
            columns: columns,
            data: data
        });
    }

    async download() {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. read
        const format = "csv";
        const filter = new WeaveHelper.Filter(null, { "id": "ASC" }, null, null);
        const res = await nodeApi.downloadTable(session, data_collection, data_table, filter, format, WeaveHelper.Options.READ_DEFAULT_NO_CHAIN)
        console.log("Download result")
        console.log(res)

        const fileName = "ethsf22_directory";
        const data = new Blob([ Buffer.from(res.data, "base64") ], { type: "application/zip" });
        var url = URL.createObjectURL(data);
        var hlink = document.createElement("a");
        hlink.href = url;
        hlink.download = fileName;
        hlink.click();
    }

    async requestProof(email) {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. generate zk proofs for stored data
        const filter = new WeaveHelper.Filter(FilterOp.eq("email", email), { "id": "DESC" }, 1, null); //retrieve the last inserted value for this email
        const gadgetType = "mimc_string_hash_preimage";
        const fields = [ "phone" ];
        const params = JSON.stringify({});
        const options = new ZKOptions(false, WeaveHelper.Options.DEFAULT_READ_TIMEOUT_SEC, WeaveHelper.Options.ALL_ACTIVE_NODES, 4096, WeaveHelper.Options.DEFAULT_COMMITMENT);
        const res = await nodeApi.zkProof(session, data_collection, data_table, gadgetType, params, fields, filter, options);
        console.log("ZK Proof result")
        console.log(res)

        const data = res.data;
        console.log("Proof: ", data)

        this.setState({
            dataProof: data
        });
    }

    async verifyProof(email, phone) {
        //1. login
        const { nodeApi, session } = await this.login();

        //2. generate zk proofs for stored data
        const filter = new WeaveHelper.Filter(FilterOp.eq("email", email), { "id": "DESC" }, 1, null); //retrieve the last inserted value for this email
        const gadgetType = "mimc_string_hash_preimage";
        const fields = [ "phone" ];

        //Notes:
        // - this passes the data to the server which hashes it, because we have it implemented only there
        // - we could also call to check just that the hash pre-image is known by passing the hash, but we don't have yet a function to compute this hash in javascript
        //   below is a sample with the hash for "+123456789"
        //   const params = JSON.stringify({ hash: "7TH4N5gBvCPhAY7KLvbPwiceCa1gCpuY1T9SnievwyM2", length: 2 });
        const params = JSON.stringify({ data: phone });
        const res = await nodeApi.verifyZkProof(session, this.state.dataProof, gadgetType, params, WeaveHelper.Options.DEFAULT_COMMITMENT, 4096);
        console.log("Verify proof result")
        console.log(res)

        const data = res.data;
        console.log("Proof check result: ", data)
    }

    render() {
        const theme = getTheme();
        const columns = this.state.columns || Array(DEFAULT_COLUMNS_COUNT).fill({});
        const data = { nodes: this.state.data || [] };

        //console.log(columns)
        //console.log(data)

        return <div align={"center"}>
            <br/>
            <button type="submit" onClick={() => this.connect()}>Connect</button>
            <br/>
            <h3>Wallet: {this.state.wallet}</h3>
            <br/>
            <button type="submit" onClick={() => this.write()}>Write</button>
            <br/>
            <br/>
            <button type="submit" onClick={() => this.compute()}>Compute</button>
            <br/>
            <span>{this.state.averageAge}</span>
            <br/>
            <br/>
            <button type="submit" onClick={() => this.download()}>Download</button>
            <br/>
            <br/>
            <button type="submit" onClick={() => this.read()}>Read</button>
            <br/>
            <CompactTable columns={columns} data={data}  theme={theme} />
            <br/>
            <br/>
            <button type="submit" onClick={() => this.requestProof("email@email.com")}>Request Proofs</button>
            <br/>
            <br/>
            <button type="submit" onClick={() => this.verifyProof("email@email.com", "+113456789")}>Verify Phone</button>
        </div>;
    }
}

export default App;
