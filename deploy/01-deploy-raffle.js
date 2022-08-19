const { network, ethers, deployments, getNamedAccounts } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2")

module.exports = async ({ deployments, getNamedAccounts }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId

    if (chainId == 31337) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transacionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transacionReceipt = await transacionResponse.wait(1)
        subscriptionId = transacionReceipt.events[0].args.subId
        // fund  subscription
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2Address"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const raffleEntranceFee = networkConfig[chainId]["raffleEntranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const keepersUpdateInterval = networkConfig[chainId]["keepersUpdateInterval"]
    const args = [
        callbackGasLimit,
        subscriptionId,
        gasLane,
        vrfCoordinatorV2Address,
        raffleEntranceFee,
        keepersUpdateInterval,
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying your contract.........")
        await verify(raffle.address, args)
    }
    log("--------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
