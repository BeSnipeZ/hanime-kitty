const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HanimeKitty", function () {
  async function deploy() {
    const [owner, friend] = await ethers.getSigners();
    const token = await ethers.deployContract("HanimeKitty");
    return { token, owner, friend };
  }

  it("has name, symbol and 18 decimals", async function () {
    const { token } = await deploy();
    expect(await token.name()).to.equal("Hanime Kitty");
    expect(await token.symbol()).to.equal("HTV");
    expect(await token.decimals()).to.equal(18n);
  });

  it("mints the whole fixed supply to the deployer", async function () {
    const { token, owner } = await deploy();
    const supply = ethers.parseUnits("1337", 18);
    expect(await token.totalSupply()).to.equal(supply);
    expect(await token.balanceOf(owner.address)).to.equal(supply);
  });

  it("transfers between wallets", async function () {
    const { token, owner, friend } = await deploy();
    await token.transfer(friend.address, ethers.parseUnits("500", 18));
    expect(await token.balanceOf(friend.address)).to.equal(ethers.parseUnits("500", 18));
  });

  it("rejects transfers above the balance", async function () {
    const { token, owner, friend } = await deploy();
    await expect(
      token.connect(friend).transfer(owner.address, 1n)
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });

  it("blocks spending someone else's coins without approval", async function () {
    const { token, owner, friend } = await deploy();
    await expect(
      token.connect(friend).transferFrom(owner.address, friend.address, 1n)
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    await expect(
      token.connect(friend).burnFrom(owner.address, 1n)
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
  });

  it("rejects sending to the zero address and burning more than owned", async function () {
    const { token, friend } = await deploy();
    await expect(token.transfer(ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    await expect(token.connect(friend).burn(1n)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });

  it("burning lowers the supply and there is no way to mint more", async function () {
    const { token } = await deploy();
    await token.burn(ethers.parseUnits("10", 18));
    expect(await token.totalSupply()).to.equal(ethers.parseUnits("1327", 18));
    expect(token.mint).to.equal(undefined);
  });
});
