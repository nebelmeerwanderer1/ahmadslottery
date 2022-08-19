const { EtherscanProvider } = require("@ethersproject/providers")
const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers, getChainId } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle unit test", async () => {
          let raffle, vrfCoordinatorV2Mock, interval
          const chainId = network.config.chainId
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture("all")
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              interval = await raffle.getInterval()
          })
          describe("Constructor", async () => {
              it("Initalizes the raffle correctly", async () => {
                  // Ideallty we make our tests have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
              })
              // My test
              it("Should have require entrance fee", async () => {
                  // Ideallty we make our tests have just 1 assert per "it"
                  const entranceFee = await raffle.getEntranceFee()
                  assert.equal(entranceFee.toString(), networkConfig[chainId]["raffleEntranceFee"])
              })
          })
          describe("enterRaffle", async () => {
              it("revert when don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.reverted
              })
              it("records player when they enter", async () => {
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("Emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffle.getEntranceFee() })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("Doesn't allow entrance when raffle calculating", async () => {
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // We pretend to be a chainlink keeper
                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffle.getEntranceFee() })).to.be
                      .reverted
              })
          })
          describe("checkUpkeep", async () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("return false if raffe isn't open", async () => {
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              t("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.reverted
              })
              it("updates the raffle state and emits a requestId", async () => {
                  // Too many asserts in this test!
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x") // emits requestId
                  const txReceipt = await txResponse.wait(1) // waits 1 block
                  const raffleState = await raffle.getRaffleState() // updates state
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1) // 0 = open, 1 = calculating
              })
          })
          describe("fulfillRandomWords", async () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffle.getEntranceFee() })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it(" can only br called after perfomUpkeed", async () => {
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be
                      .reverted
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be
                      .reverted
              })
              it("picks a winner, reset lottery and send money", async () => {
                  raffleEntranceFee = await raffle.getEntranceFee()
                  const additionalEntrants = 3
                  const startingAccountindex = 1 // deployer = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountindex;
                      i < startingAccountindex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffle.getEntranceFee() })
                  }

                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  //perfomUpkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being chainlink vrf)
                  // We will have to  wait for fullfilllRandomWords to be called

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              //   console.log(recentWinner)
                              //   console.log(accounts[1].address)
                              //   console.log(accounts[2].address)
                              //   console.log(accounts[3].address)
                              //   console.log(accounts[0].address)
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              assert.equal(numPlayers, "0")
                              assert.equal(raffleState, "1")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      // Setting up the listner
                      // below , we will fire the event, and the answer will pick it up, and resolve

                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
