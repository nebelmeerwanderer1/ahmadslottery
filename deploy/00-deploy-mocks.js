const { network, ethers, getNamedAccounts, deployments } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

const BASE_FEE = ethers.utils.parseEther("0.25") // it cost 0.45 link to get reuqest
const GAS_PRICE_LINK = 1e9 // 1000000000 // chainlink node pays the gas to give us randomness
//the price of the request change base on the gas price

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (chainId == 31337) {
        log("Local network detected! Deploying.......")
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks Deployed!")
        log("-------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
